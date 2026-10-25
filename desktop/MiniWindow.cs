using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// A small native view of the same collector. It never starts or stops collection.
// Requests require the launch token; no controller secrets or arbitrary URLs are accepted.
internal sealed class MiniWindow : Form
{
    private readonly string baseUrl, token, preferencesFile;
    private readonly Action openDashboard;
    private readonly Label state, rates, today, remaining;
    private readonly Button pin, collapse, dashboard;
    private readonly Panel details;
    private readonly System.Windows.Forms.Timer timer;
    private bool polling, collapsed, wantedVisible, ready;
    private string language = "auto";

    private bool Chinese { get { return language == "zh-CN" || (language == "auto" && CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh"); } }
    private string Local(string en, string zh) { return Chinese ? zh : en; }
    internal MiniWindow(string address, string dataDir, string launchToken, Action showDashboard)
    {
        baseUrl = address; token = launchToken; openDashboard = showDashboard;
        preferencesFile = Path.Combine(dataDir, "mini-window.json");
        AutoScaleMode = AutoScaleMode.Dpi; AutoScaleDimensions = new SizeF(96, 96);
        Font = new Font("Segoe UI", 9F); BackColor = Color.FromArgb(15, 22, 31); ForeColor = Color.FromArgb(226, 236, 242);
        FormBorderStyle = FormBorderStyle.FixedToolWindow; ShowInTaskbar = false; MaximizeBox = false; MinimizeBox = false;
        StartPosition = FormStartPosition.Manual; ClientSize = new Size(330, 178); TopMost = true;
        Rectangle screen = Screen.PrimaryScreen.WorkingArea;
        Location = new Point(screen.Right - Width - 24, screen.Bottom - Height - 24);
        FlowLayoutPanel controls = new FlowLayoutPanel(); controls.Dock = DockStyle.Top; controls.Height = 32;
        controls.Padding = new Padding(8, 3, 0, 0); controls.WrapContents = false;
        pin = SmallButton(); collapse = SmallButton(); dashboard = SmallButton();
        pin.Click += delegate { TopMost = !TopMost; RefreshLabels(); SavePreferences(); };
        collapse.Click += delegate { collapsed = !collapsed; ApplyLayout(); SavePreferences(); };
        dashboard.Click += delegate { openDashboard(); };
        controls.Controls.Add(pin); controls.Controls.Add(collapse); controls.Controls.Add(dashboard);
        state = TextLine(22, 9F); state.Dock = DockStyle.Top;
        rates = TextLine(34, 12F); rates.Dock = DockStyle.Top; rates.Font = new Font("Segoe UI Semibold", 12F);
        details = new Panel(); details.Dock = DockStyle.Top; details.Height = 74;
        today = TextLine(32, 10F); today.Dock = DockStyle.Top;
        remaining = TextLine(34, 9F); remaining.Dock = DockStyle.Top;
        details.Controls.Add(remaining); details.Controls.Add(today);
        Controls.Add(details); Controls.Add(rates); Controls.Add(state); Controls.Add(controls);
        ReadPreferences(); RefreshLabels(); ApplyLayout(); KeepOnScreen();
        timer = new System.Windows.Forms.Timer(); timer.Interval = 1000;
        timer.Tick += async delegate { await RefreshSnapshot(); };
        VisibleChanged += async delegate {
            if (Visible) { timer.Start(); await RefreshSnapshot(); } else timer.Stop();
        };
        ResizeEnd += delegate { KeepOnScreen(); SavePreferences(); };
        FormClosing += delegate(object sender, FormClosingEventArgs args) {
            if (args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; HideMini(); }
        };
        ready = true;
    }
    private Button SmallButton()
    {
        Button button = new Button(); button.AutoSize = true; button.Height = 25; button.MinimumSize = new Size(84, 25);
        button.FlatStyle = FlatStyle.Flat; button.FlatAppearance.BorderColor = Color.FromArgb(55, 74, 87);
        button.Margin = new Padding(0, 0, 6, 0); button.TabStop = true;
        return button;
    }
    private Label TextLine(int height, float fontSize)
    {
        Label label = new Label(); label.AutoSize = false; label.Height = height;
        label.Padding = new Padding(12, 0, 8, 0); label.TextAlign = ContentAlignment.MiddleLeft;
        label.Font = new Font("Segoe UI", fontSize); label.AutoEllipsis = true;
        return label;
    }
    private void RefreshLabels()
    {
        Text = Local("Codex Netwatch · Mini", "Codex Netwatch · 悬浮窗");
        pin.Text = TopMost ? Local("Pinned", "已置顶") : Local("Pin", "置顶");
        collapse.Text = collapsed ? Local("Expand", "展开") : Local("Collapse", "收起");
        dashboard.Text = Local("Dashboard", "监控面板");
        SetUnavailable();
    }
    private void ApplyLayout()
    {
        details.Visible = !collapsed;
        // Layout heights are already scaled by WinForms when the display DPI changes.
        ClientSize = new Size(ClientSize.Width, Controls[3].Height + state.Height + rates.Height + (collapsed ? 6 : details.Height + 6));
        collapse.Text = collapsed ? Local("Expand", "展开") : Local("Collapse", "收起");
        KeepOnScreen();
    }
    internal object State()
    {
        return new { visible = Visible, pinned = TopMost, collapsed = collapsed };
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    internal object Command(string action, string requestedLanguage)
    {
        if (action == "show") {
            if (requestedLanguage == "en" || requestedLanguage == "zh-CN" || requestedLanguage == "auto") {
                language = requestedLanguage; RefreshLabels();
            }
            wantedVisible = true; KeepOnScreen(); Show(); SavePreferences();
        } else if (action == "hide") HideMini();
        else if (action != "get") throw new ArgumentException("Unknown mini-window action.");
        return State();
    }
    internal void RestoreVisibility()
    {
        if (wantedVisible) { KeepOnScreen(); Show(); }
    }
    internal void HideMini()
    {
        wantedVisible = false; Hide(); SavePreferences();
    }
    private void KeepOnScreen()
    {
        Rectangle work = Screen.FromRectangle(Bounds).WorkingArea;
        Location = new Point(Math.Max(work.Left, Math.Min(Left, work.Right - Width)),
            Math.Max(work.Top, Math.Min(Top, work.Bottom - Height)));
    }
    private void ReadPreferences()
    {
        try {
            if (!File.Exists(preferencesFile) || new FileInfo(preferencesFile).Length > 8192) return;
            Dictionary<string, object> prefs = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(preferencesFile));
            object value;
            if (prefs.TryGetValue("visible", out value) && value is bool) wantedVisible = (bool)value;
            if (prefs.TryGetValue("pinned", out value) && value is bool) TopMost = (bool)value;
            if (prefs.TryGetValue("collapsed", out value) && value is bool) collapsed = (bool)value;
            if (prefs.TryGetValue("language", out value) && (Object.Equals(value, "en") || Object.Equals(value, "zh-CN"))) language = (string)value;
            object x, y;
            if (prefs.TryGetValue("x", out x) && prefs.TryGetValue("y", out y) && x is int && y is int)
                Location = new Point((int)x, (int)y);
        } catch { /* A damaged preference file must not affect the collector. */ }
    }
    private void SavePreferences()
    {
        if (!ready) return;
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(preferencesFile));
            File.WriteAllText(preferencesFile, new JavaScriptSerializer().Serialize(new {
                visible = wantedVisible, pinned = TopMost, collapsed = collapsed, language = language, x = Left, y = Top
            }));
        } catch { /* A read-only preference folder must not interrupt collection. */ }
    }
    private async Task RefreshSnapshot()
    {
        if (polling || !Visible || IsDisposed) return;
        polling = true;
        try {
            Dictionary<string, object> snapshot = await Task.Run(() => ReadSnapshot());
            if (!IsDisposed && Visible) Render(snapshot);
        } catch { if (!IsDisposed && Visible) SetUnavailable(); }
        finally { polling = false; }
    }
    private Dictionary<string, object> ReadSnapshot()
    {
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/mini");
        request.Proxy = null; request.Timeout = 1500; request.ReadWriteTimeout = 1500;
        request.AllowAutoRedirect = false; request.KeepAlive = false;
        request.Headers["X-Codex-Flow"] = "1"; request.Headers["X-Codex-Desktop-Token"] = token;
        using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
        using (StreamReader reader = new StreamReader(response.GetResponseStream())) {
            char[] buffer = new char[32769]; int length = reader.ReadBlock(buffer, 0, buffer.Length);
            if (length > 32768 || response.StatusCode != HttpStatusCode.OK) return null;
            return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(new string(buffer, 0, length));
        }
    }
    private void SetUnavailable()
    {
        state.Text = Local("Collector unavailable · no live data", "采集不可用 · 暂无实时数据");
        state.ForeColor = Color.FromArgb(235, 185, 102);
        rates.Text = "Codex  ↑ —   ↓ —";
        today.Text = Local("Today · —", "今日 · —"); remaining.Text = Local("Budget remaining · —", "剩余预算 · —");
    }
    private void Render(Dictionary<string, object> snapshot)
    {
        if (snapshot == null) { SetUnavailable(); return; }
        Dictionary<string, object> status = snapshot["status"] as Dictionary<string, object>;
        Dictionary<string, object> budget = snapshot["budget"] as Dictionary<string, object>;
        if (status == null || budget == null) { SetUnavailable(); return; }
        object up, down;
        bool fresh = Convert.ToString(status["state"]) == "connected" && status.TryGetValue("upRate", out up) && up != null
            && status.TryGetValue("downRate", out down) && down != null;
        string source = "";
        Dictionary<string, object> capture = status["capture"] as Dictionary<string, object>;
        if (capture != null && capture.ContainsKey("active")) source = Convert.ToString(capture["active"]);
        bool demo = status.ContainsKey("demo") && Object.Equals(status["demo"], true);
        state.Text = (demo ? Local("DEMO · ", "演示 · ") : "") + (fresh ? Local("Collecting", "正在采集") : Local("Waiting for live data", "等待实时数据")) + (source.Length > 0 ? " · " + source : "");
        state.ForeColor = fresh ? Color.FromArgb(106, 223, 191) : Color.FromArgb(235, 185, 102);
        rates.Text = "Codex  ↑ " + (fresh ? Bytes(status["upRate"]) + "/s" : "—") + "   ↓ " + (fresh ? Bytes(status["downRate"]) + "/s" : "—");
        Dictionary<string, object> settings = budget["settings"] as Dictionary<string, object>;
        Dictionary<string, object> day = budget["day"] as Dictionary<string, object>;
        Dictionary<string, object> month = budget["month"] as Dictionary<string, object>;
        if (settings == null || day == null || month == null) throw new InvalidDataException("Incomplete mini snapshot.");
        string scope = Convert.ToString(settings["scope"]) == "all" ? Local("All observed", "全部已观测") : "Codex";
        today.Text = Local("Today", "今日") + " · " + scope + "  " + Bytes(day["usedBytes"]);
        bool daily = Object.Equals(day["enabled"], true), monthly = Object.Equals(month["enabled"], true);
        string dailyRemaining = daily ? PeriodRemaining(day) : Local("off", "未设置");
        string monthlyRemaining = monthly ? PeriodRemaining(month) : Local("off", "未设置");
        remaining.Text = Local("Left: day ", "剩余：日 ") + dailyRemaining + Local(" · month ", " · 月 ") + monthlyRemaining;
        remaining.ForeColor = Convert.ToString(day["state"]) == "exceeded" || Convert.ToString(month["state"]) == "exceeded"
            ? Color.FromArgb(255, 158, 158) : ForeColor;
    }
    private string PeriodRemaining(Dictionary<string, object> period)
    {
        if (Convert.ToString(period["state"]) == "exceeded") return Local("over ", "超出 ") + Bytes(period["overBytes"]);
        return Bytes(period["remainingBytes"]);
    }
    private static string Bytes(object raw)
    {
        double bytes = Math.Max(0, Convert.ToDouble(raw, CultureInfo.InvariantCulture));
        string[] units = { "B", "KB", "MB", "GB", "TB", "PB" }; int unit = 0;
        while (bytes >= 1000 && unit < units.Length - 1) { bytes /= 1000; unit++; }
        return bytes.ToString(unit == 0 ? "0" : "0.0", CultureInfo.InvariantCulture) + " " + units[unit];
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { SavePreferences(); if (timer != null) { timer.Stop(); timer.Dispose(); } }
        base.Dispose(disposing);
    }
}
