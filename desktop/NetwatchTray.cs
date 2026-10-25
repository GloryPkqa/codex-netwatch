using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Codex Netwatch")]
[assembly: AssemblyDescription("Portable local dashboard, collector and system tray host")]
[assembly: AssemblyCompany("GloryPkqa")]
[assembly: AssemblyProduct("Codex Netwatch")]
[assembly: AssemblyVersion("0.5.0.0")]

internal sealed class TrayOptions
{
    internal string Root, DataDir, BaseUrl, InstanceName;
    internal bool Demo, NoBrowser;
    internal string Command;
    internal static TrayOptions Read(string[] args)
    {
        TrayOptions result = new TrayOptions();
        result.Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        result.Demo = Array.IndexOf(args, "--demo") >= 0;
        result.NoBrowser = Array.IndexOf(args, "--no-browser") >= 0;
        foreach (string arg in args)
        {
            if (arg == "--exit" || arg == "--stop" || arg == "--start") result.Command = arg.Substring(2);
            else if (arg != "--demo" && arg != "--no-browser") throw new ArgumentException("Unknown option: " + arg);
        }
        int port = 43128;
        string localConfig = Path.Combine(result.Root, "config.local.json");
        if (File.Exists(localConfig))
        {
            Dictionary<string, object> config = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(localConfig));
            object configured;
            if (config.TryGetValue("port", out configured)) port = Convert.ToInt32(configured, CultureInfo.InvariantCulture);
        }
        if (result.Demo) port = 43129;
        string configuredPort = Environment.GetEnvironmentVariable("CODEX_FLOW_PORT");
        if (!String.IsNullOrEmpty(configuredPort)) port = Int32.Parse(configuredPort, CultureInfo.InvariantCulture);
        if (port < 1024 || port > 65535) throw new ArgumentException("Port must be 1024-65535.");
        result.BaseUrl = "http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture);
        string data = Environment.GetEnvironmentVariable("CODEX_FLOW_DATA_DIR");
        if (String.IsNullOrEmpty(data)) data = "data";
        if (!Path.IsPathRooted(data)) data = Path.Combine(result.Root, data);
        data = Path.GetFullPath(data);
        result.DataDir = result.Demo ? Path.Combine(data, "demo") : data;
        using (SHA256 hash = SHA256.Create())
        {
            string identity = result.DataDir.TrimEnd(Path.DirectorySeparatorChar).ToUpperInvariant();
            result.InstanceName = "Local\\CodexNetwatch-" + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(identity))).Replace("-", "").Substring(0, 32);
        }
        return result;
    }
}

internal sealed class NetwatchTray : ApplicationContext
{
    private readonly TrayOptions options;
    private readonly NotifyIcon tray;
    private readonly ToolStripMenuItem status, start, stop;
    private readonly System.Windows.Forms.Timer timer;
    private readonly EventWaitHandle openEvent, startEvent, stopEvent, exitEvent;
    private readonly string token;
    private Process child;
    private DashboardWindow dashboard;
    private MiniWindow mini;
    private readonly StartupRegistration startup;
    private bool starting, exiting, openingAfterStart;
    private DateTime startupDeadline, nextHealth;
    private long lastBudgetAlert = -1;
    private long lastBudgetAlertAt = -1;
    private readonly object logLock = new object();
    private readonly bool chinese = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh";
    private readonly bool silentTest = Environment.GetEnvironmentVariable("NETWATCH_TEST_SILENT") == "1";

    private string Text(string en, string zh) { return chinese ? zh : en; }
    private void ShowBalloon(int timeout, string title, string message, ToolTipIcon icon)
    {
        if (!silentTest) tray.ShowBalloonTip(timeout, title, message, icon);
    }
    internal NetwatchTray(TrayOptions value)
    {
        options = value;
        startup = new StartupRegistration(Application.ExecutablePath);
        using (RandomNumberGenerator random = RandomNumberGenerator.Create())
        {
            byte[] bytes = new byte[32]; random.GetBytes(bytes);
            token = BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }
        openEvent = new EventWaitHandle(false, EventResetMode.AutoReset, options.InstanceName + "-open");
        startEvent = new EventWaitHandle(false, EventResetMode.AutoReset, options.InstanceName + "-start");
        stopEvent = new EventWaitHandle(false, EventResetMode.AutoReset, options.InstanceName + "-stop");
        exitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, options.InstanceName + "-exit");
        ContextMenuStrip menu = new ContextMenuStrip();
        status = new ToolStripMenuItem(Text("Starting...", "正在启动…")); status.Enabled = false;
        menu.Items.Add(status);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Text("Open dashboard", "打开监控页面"), null, delegate { OpenDashboard(); });
        ToolStripMenuItem miniItem = new ToolStripMenuItem(Text("Mini window", "迷你悬浮窗"));
        miniItem.Click += delegate { MiniCommand(mini != null && mini.Visible ? "hide" : "show", null); };
        menu.Items.Add(miniItem);
        menu.Items.Add(Text("Open in browser", "在浏览器打开"), null, delegate { OpenBrowser(); });
        ToolStripMenuItem autoStart = new ToolStripMenuItem(Text("Start with Windows", "开机自启"));
        autoStart.Click += delegate {
            try { startup.SetEnabled(!startup.Enabled); autoStart.Checked = startup.Enabled; }
            catch (Exception error) { ShowFailure(error.Message); }
        };
        menu.Opening += delegate {
            try { autoStart.Checked = startup.Enabled; }
            catch { autoStart.Enabled = false; }
            miniItem.Checked = mini != null && mini.Visible;
        };
        menu.Items.Add(autoStart);
        start = new ToolStripMenuItem(Text("Start collector", "启动采集"), null, delegate { StartCollector(false); });
        stop = new ToolStripMenuItem(Text("Stop collector", "停止采集"), null, delegate { StopCollector(); });
        menu.Items.Add(start); menu.Items.Add(stop);
        menu.Items.Add(Text("Open data folder", "打开数据目录"), null, delegate {
            Directory.CreateDirectory(options.DataDir);
            Process.Start(new ProcessStartInfo(options.DataDir) { UseShellExecute = true });
        });
        menu.Items.Add(Text("Project on GitHub", "GitHub 项目"), null, delegate {
            Process.Start(new ProcessStartInfo("https://github.com/GloryPkqa/codex-netwatch") { UseShellExecute = true });
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Text("Exit (stop own collector)", "退出并停止本次采集"), null, delegate { ExitThread(); });
        tray = new NotifyIcon();
        using (Stream icon = Assembly.GetExecutingAssembly().GetManifestResourceStream("Netwatch.ico")) tray.Icon = new Icon(icon);
        tray.ContextMenuStrip = menu; tray.Text = "Codex Netwatch"; tray.Visible = true;
        tray.DoubleClick += delegate { OpenDashboard(); };
        timer = new System.Windows.Forms.Timer(); timer.Interval = 200;
        timer.Tick += Tick; timer.Start();
        StartCollector(!options.NoBrowser);
        EnsureMini(); mini.RestoreVisibility();
    }

    private Dictionary<string, object> Health()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(options.BaseUrl + "/api/health");
            req.Proxy = null; req.Timeout = 700; req.ReadWriteTimeout = 700;
            req.AllowAutoRedirect = false; req.KeepAlive = false;
            using (HttpWebResponse response = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                char[] buffer = new char[8193];
                int length = reader.ReadBlock(buffer, 0, buffer.Length);
                if (length > 8192 || response.StatusCode != HttpStatusCode.OK) return null;
                return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(new string(buffer, 0, length));
            }
        }
        catch { return null; }
    }
    private bool Compatible(Dictionary<string, object> health)
    {
        object app, demo, version;
        return health != null && health.TryGetValue("app", out app) && Convert.ToString(app) == "codex-flow"
            && health.TryGetValue("version", out version) && !String.IsNullOrEmpty(Convert.ToString(version))
            && health.TryGetValue("demo", out demo) && demo is bool && (bool)demo == options.Demo;
    }
    private void CheckBudgetAlerts()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(options.BaseUrl + "/api/budget-notifications");
            req.Proxy = null; req.Timeout = 700; req.ReadWriteTimeout = 700;
            req.AllowAutoRedirect = false; req.KeepAlive = false;
            req.Headers["X-Codex-Flow"] = "1"; req.Headers["X-Codex-Desktop-Token"] = token;
            using (HttpWebResponse response = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
            {
                char[] buffer = new char[8193];
                int count = reader.ReadBlock(buffer, 0, buffer.Length);
                if (count > 8192) return;
                Dictionary<string, object> data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(new string(buffer, 0, count));
                Dictionary<string, object> latest = data["latest"] as Dictionary<string, object>;
                long id = latest == null ? 0 : Convert.ToInt64(latest["id"], CultureInfo.InvariantCulture);
                long at = latest == null ? 0 : Convert.ToInt64(latest["at"], CultureInfo.InvariantCulture);
                bool fresh = lastBudgetAlert >= 0 && (id > lastBudgetAlert || at > lastBudgetAlertAt);
                lastBudgetAlert = id; lastBudgetAlertAt = at;
                if (!fresh || !Convert.ToBoolean(data["enabled"], CultureInfo.InvariantCulture)) return;
                string period = Convert.ToString(latest["kind"]) == "day" ? Text("Daily", "每日") : Text("Monthly", "每月");
                string scope = Convert.ToString(latest["scope"]) == "all" ? Text("all observed processes", "全部已观测进程") : "Codex";
                string title = period + " " + scope + " " + Text("budget alert", "预算提醒");
                string body = Text("Recorded ", "已观测 ") + Convert.ToString(latest["usedGB"]) + " / " + Convert.ToString(latest["limitGB"], CultureInfo.InvariantCulture) + " GB (" + Convert.ToString(latest["percent"]) + "%)";
                ShowBalloon(10000, title, body, ToolTipIcon.Warning);
            }
        }
        catch { /* Notification delivery must never interrupt collection. */ }
    }
    private bool Owns(Dictionary<string, object> health)
    {
        object marker;
        return child != null && !child.HasExited && Compatible(health)
            && health.TryGetValue("desktopInstance", out marker) && Convert.ToString(marker) == token;
    }
    private void OpenDashboard()
    {
        Dictionary<string, object> health = Health();
        if (!Compatible(health)) { StartCollector(true); return; }
        ShowDashboard();
    }
    private void OpenBrowser()
    {
        Process.Start(new ProcessStartInfo(options.BaseUrl) { UseShellExecute = true });
    }
    private void ShowDashboard()
    {
        try
        {
            if (dashboard == null || dashboard.IsDisposed)
            {
                dashboard = new DashboardWindow(options.BaseUrl, Path.Combine(options.DataDir, "webview-profile"),
                    delegate(string url) { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); },
                    delegate(string message) {
                        Log("webview", message);
                        ShowBalloon(8000, "Codex Netwatch", Text("Desktop view unavailable; the collector is still controlled from the tray.", "内置面板暂不可用，仍可通过托盘控制采集或打开浏览器。"), ToolTipIcon.Warning);
                    }, delegate { return startup.Enabled; }, delegate(bool enabled) { startup.SetEnabled(enabled); }, MiniCommand);
                dashboard.Icon = tray.Icon;
            }
            dashboard.ShowDashboard();
        }
        catch (Exception error) { ShowFailure(error.Message); OpenBrowser(); }
    }
    private void EnsureMini()
    {
        if (mini != null && !mini.IsDisposed) return;
        mini = new MiniWindow(options.BaseUrl, options.DataDir, token, OpenDashboard);
        mini.Icon = tray.Icon;
    }
    private object MiniCommand(string action, string language)
    {
        EnsureMini(); return mini.Command(action, language);
    }
    private void ShowFailure(string message)
    {
        status.Text = Text("Stopped - check logs", "已停止，请查看日志");
        ShowBalloon(8000, "Codex Netwatch", message, ToolTipIcon.Warning);
        Log("launcher", message);
    }
    private void StartCollector(bool openBrowser)
    {
        if (starting || exiting) { openingAfterStart |= openBrowser; return; }
        Dictionary<string, object> health = Health();
        if (Compatible(health))
        {
            UpdateStatus(health);
            if (openBrowser) ShowDashboard();
            return;
        }
        // Even a service imitating our public health response is never sent a stop request.
        // Ownership requires this child handle plus a fresh random launch marker.
        if (child != null && !child.HasExited)
        {
            ShowFailure(Text("Collector is still starting or stopping. Please retry.", "采集器仍在启动或退出，请稍后重试。"));
            return;
        }
        string node = Path.Combine(options.Root, "runtime", "node.exe");
        string main = Path.Combine(options.Root, "src", "main.mjs");
        if (!File.Exists(node) || !File.Exists(main))
        {
            ShowFailure(Text("Missing portable files. Extract the entire ZIP, then launch again.", "便携文件缺失，请完整解压 ZIP 后重试。"));
            return;
        }
        ProcessStartInfo info = new ProcessStartInfo(node);
        info.WorkingDirectory = options.Root;
        info.Arguments = "--disable-warning=ExperimentalWarning " + Quote(main) + (options.Demo ? " --demo" : "");
        info.UseShellExecute = false; info.CreateNoWindow = true; info.WindowStyle = ProcessWindowStyle.Hidden;
        info.RedirectStandardOutput = true; info.RedirectStandardError = true; info.RedirectStandardInput = true;
        info.EnvironmentVariables["CODEX_FLOW_PORT"] = new Uri(options.BaseUrl).Port.ToString(CultureInfo.InvariantCulture);
        info.EnvironmentVariables["CODEX_NETWATCH_DESKTOP_TOKEN"] = token;
        info.EnvironmentVariables["CODEX_NETWATCH_HOST_PID"] = Process.GetCurrentProcess().Id.ToString(CultureInfo.InvariantCulture);
        try
        {
            Directory.CreateDirectory(options.DataDir);
            if (child != null) child.Dispose();
            child = new Process(); child.StartInfo = info;
            child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) Log("server", args.Data); };
            child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) Log("error", args.Data); };
            child.Start(); child.StandardInput.Close(); child.BeginOutputReadLine(); child.BeginErrorReadLine();
            starting = true; openingAfterStart = openBrowser;
            startupDeadline = DateTime.UtcNow.AddSeconds(15); nextHealth = DateTime.MinValue;
            status.Text = Text("Starting...", "正在启动…"); start.Enabled = false; stop.Enabled = false;
        }
        catch (Exception error) { ShowFailure(error.Message); }
    }
    private void UpdateStatus(Dictionary<string, object> health)
    {
        bool valid = Compatible(health), own = Owns(health);
        object state;
        bool collecting = valid && health.TryGetValue("state", out state) && Object.Equals(state, "connected");
        start.Enabled = !starting && !valid;
        stop.Enabled = own;
        status.Text = own ? (collecting ? Text("Collector running", "正在采集") : Text("Waiting for capture source", "等待采集源连接"))
            : valid ? Text("Existing monitor (view only)", "已有监控（仅查看）") : Text("Collector stopped", "采集已停止");
        tray.Text = "Codex Netwatch" + (options.Demo ? " [DEMO]" : "") + (collecting ? " - ON" : valid ? " - WAIT" : " - OFF");
    }
    private void Tick(object sender, EventArgs args)
    {
        if (exitEvent.WaitOne(0)) { ExitThread(); return; }
        if (stopEvent.WaitOne(0)) StopCollector();
        if (startEvent.WaitOne(0)) StartCollector(false);
        if (openEvent.WaitOne(0)) OpenDashboard();
        if (DateTime.UtcNow < nextHealth) return;
        nextHealth = DateTime.UtcNow.AddMilliseconds(starting ? 300 : 3000);
        Dictionary<string, object> health = Health();
        if (starting)
        {
            if (Owns(health))
            {
                starting = false;
                if (openingAfterStart) ShowDashboard();
                openingAfterStart = false;
            }
            else if (child.HasExited || DateTime.UtcNow > startupDeadline)
            {
                starting = false; openingAfterStart = false;
                // Only terminate the exact process started by this host, never a matching process name.
                if (!child.HasExited) { child.Kill(); child.WaitForExit(3000); }
                ShowFailure(Text("Collector could not start. The port or data folder may already be in use. See tray.log.", "采集启动失败，端口或数据目录可能已被占用。请查看 tray.log。"));
            }
        }
        if (!starting) UpdateStatus(health);
        if (Owns(health)) CheckBudgetAlerts();
    }
    private void StopCollector()
    {
        if (child == null || child.HasExited) { starting = false; UpdateStatus(Health()); return; }
        Dictionary<string, object> health = Health();
        if (Owns(health))
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(options.BaseUrl + "/api/stop");
                req.Proxy = null; req.Method = "POST"; req.Timeout = 1500; req.ReadWriteTimeout = 1500;
                req.AllowAutoRedirect = false; req.Headers["X-Codex-Flow"] = "1";
                req.Headers["X-Codex-Desktop-Token"] = token;
                req.ContentType = "application/json"; req.ContentLength = 2;
                using (Stream body = req.GetRequestStream()) body.Write(new byte[] { 123, 125 }, 0, 2);
                using (WebResponse response = req.GetResponse()) { }
                child.WaitForExit(5000);
            }
            catch (Exception error) { Log("launcher", "Graceful stop failed: " + error.Message); }
        }
        // This also handles a child that never reached readiness. Its Process handle cannot target a foreign PID.
        if (!child.HasExited) { child.Kill(); child.WaitForExit(3000); }
        starting = false; openingAfterStart = false;
        UpdateStatus(null);
    }
    private void Log(string source, string message)
    {
        try
        {
            lock (logLock)
            {
                Directory.CreateDirectory(options.DataDir);
                string file = Path.Combine(options.DataDir, "tray.log");
                if (File.Exists(file) && new FileInfo(file).Length > 2 * 1024 * 1024)
                {
                    string previous = file + ".1";
                    if (File.Exists(previous)) File.Delete(previous);
                    File.Move(file, previous);
                }
                if (message.Length > 16384) message = message.Substring(0, 16384) + " [truncated]";
                File.AppendAllText(file, DateTime.UtcNow.ToString("o") + " [" + source + "] " + message + Environment.NewLine);
            }
        }
        catch { /* Logging cannot crash collector lifecycle handling. */ }
    }
    internal static string Quote(string argument)
    {
        // Windows CommandLineToArgvW quoting, including trailing backslashes.
        StringBuilder value = new StringBuilder("\""); int slashes = 0;
        foreach (char character in argument)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') value.Append('\\', slashes * 2 + 1);
            else value.Append('\\', slashes);
            slashes = 0; value.Append(character);
        }
        value.Append('\\', slashes * 2); value.Append('"'); return value.ToString();
    }
    protected override void ExitThreadCore()
    {
        if (exiting) return;
        exiting = true; timer.Stop();
        if (dashboard != null) { dashboard.Dispose(); dashboard = null; }
        if (mini != null) { mini.Dispose(); mini = null; }
        StopCollector();
        tray.Visible = false; tray.Dispose(); timer.Dispose();
        openEvent.Dispose(); startEvent.Dispose(); stopEvent.Dispose(); exitEvent.Dispose();
        if (child != null) child.Dispose();
        base.ExitThreadCore();
    }
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            TrayOptions options = TrayOptions.Read(args);
            if (options.Command != null) return Signal(options.InstanceName, options.Command);
            using (Mutex mutex = new Mutex(false, options.InstanceName))
            {
                bool owner;
                try { owner = mutex.WaitOne(0); } catch (AbandonedMutexException) { owner = true; }
                if (!owner) return Signal(options.InstanceName, options.NoBrowser ? "start" : "open");
                try { Application.Run(new NetwatchTray(options)); }
                finally { mutex.ReleaseMutex(); }
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Codex Netwatch", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    private static int Signal(string name, string command)
    {
        for (int attempt = 0; attempt < 10; attempt++)
        {
            try { using (EventWaitHandle signal = EventWaitHandle.OpenExisting(name + "-" + command)) { signal.Set(); return 0; } }
            catch (WaitHandleCannotBeOpenedException) { Thread.Sleep(100); }
        }
        return 4;
    }
}
