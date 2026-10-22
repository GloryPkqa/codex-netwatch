using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// The desktop and browser use the same local frontend and collector.
// No native bridge, filesystem host object, or remote content is exposed to the page.
internal sealed class DashboardWindow : Form
{
    private readonly Uri origin;
    private readonly string profile;
    private readonly Action<string> openExternal, reportFailure;
    private WebView2 view;
    private readonly Panel fallback;
    private readonly Label message;
    private bool initializing, initialized, rendererFailed;
    private readonly HashSet<ulong> blockedNavigations = new HashSet<ulong>();
    private readonly Func<bool> readStartup;
    private readonly Action<bool> writeStartup;
    private Button startupButton;
    private readonly bool chinese = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh";

    private string Local(string en, string zh) { return chinese ? zh : en; }
    internal DashboardWindow(string baseUrl, string profileFolder, Action<string> external, Action<string> failure,
        Func<bool> getStartup = null, Action<bool> setStartup = null)
    {
        origin = new Uri(baseUrl); profile = profileFolder; openExternal = external; reportFailure = failure;
        readStartup = getStartup; writeStartup = setStartup;
        Text = "Codex Netwatch";
        StartPosition = FormStartPosition.CenterScreen;
        Rectangle workingArea = Screen.PrimaryScreen.WorkingArea;
        ClientSize = new Size(Math.Min(1280, Math.Max(760, workingArea.Width - 80)),
            Math.Min(860, Math.Max(560, workingArea.Height - 100)));
        MinimumSize = new Size(Math.Min(800, workingArea.Width), Math.Min(600, workingArea.Height));
        AutoScaleMode = AutoScaleMode.Dpi; BackColor = Color.FromArgb(13, 18, 26);
        view = new WebView2(); view.Dock = DockStyle.Fill;
        view.DefaultBackgroundColor = BackColor;
        Controls.Add(view);
        fallback = new Panel(); fallback.Dock = DockStyle.Fill; fallback.BackColor = BackColor;
        message = new Label(); message.ForeColor = Color.White; message.AutoSize = false;
        message.TextAlign = ContentAlignment.MiddleCenter; message.Dock = DockStyle.Fill;
        message.Font = new Font("Segoe UI", 12);
        message.Text = Local("Loading dashboard...", "正在加载监控面板…");
        FlowLayoutPanel actions = new FlowLayoutPanel(); actions.Dock = DockStyle.Bottom; actions.Height = 72;
        actions.FlowDirection = FlowDirection.LeftToRight; actions.Padding = new Padding(24, 12, 24, 12);
        Button retry = new Button(); retry.Text = Local("Retry", "重试"); retry.AutoSize = true;
        retry.Click += async delegate { await InitializeDashboard(); };
        Button browser = new Button(); browser.Text = Local("Open in browser", "在浏览器打开"); browser.AutoSize = true;
        browser.Click += delegate { openExternal(origin.AbsoluteUri); };
        Button runtime = new Button(); runtime.Text = Local("Get WebView2", "安装 WebView2"); runtime.AutoSize = true;
        runtime.Click += delegate { openExternal("https://developer.microsoft.com/microsoft-edge/webview2/"); };
        actions.Controls.Add(retry); actions.Controls.Add(browser); actions.Controls.Add(runtime);
        fallback.Controls.Add(message); fallback.Controls.Add(actions); Controls.Add(fallback);
        if (readStartup != null && writeStartup != null)
        {
            FlowLayoutPanel toolbar = new FlowLayoutPanel(); toolbar.Dock = DockStyle.Top; toolbar.Height = 44;
            toolbar.BackColor = Color.FromArgb(22, 29, 31); toolbar.Padding = new Padding(10, 6, 10, 6);
            startupButton = new Button(); startupButton.AutoSize = true; startupButton.FlatStyle = FlatStyle.Flat;
            startupButton.ForeColor = Color.FromArgb(209, 250, 228); startupButton.BackColor = Color.FromArgb(34, 51, 43);
            startupButton.AccessibleName = Local("Start with Windows", "开机自启");
            startupButton.Click += delegate {
                try { writeStartup(!readStartup()); RefreshStartup(); }
                catch (Exception error) {
                    reportFailure(error.Message);
                    MessageBox.Show(this, Local("Could not save startup preference.", "无法保存开机自启设置。") + "\n" + error.Message,
                        "Codex Netwatch", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            };
            Label hint = new Label(); hint.AutoSize = true; hint.Margin = new Padding(12, 8, 0, 0);
            hint.ForeColor = Color.FromArgb(157, 177, 173);
            hint.Text = Local("Close the window to continue in the tray", "关闭窗口后继续在托盘采集");
            toolbar.Controls.Add(startupButton); toolbar.Controls.Add(hint); Controls.Add(toolbar);
            Activated += delegate { RefreshStartup(); };
            RefreshStartup();
        }
        Shown += async delegate { await InitializeDashboard(); };
        FormClosing += delegate(object sender, FormClosingEventArgs args) {
            if (args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; Hide(); }
        };
        VisibleChanged += async delegate {
            try {
                if (view.CoreWebView2 == null || rendererFailed) return;
                if (Visible) view.CoreWebView2.Resume();
                else {
                    await view.CoreWebView2.TrySuspendAsync();
                    if (!IsDisposed && Visible && view.CoreWebView2 != null) view.CoreWebView2.Resume();
                }
            } catch { /* Suspension is an optional resource optimization, not collector state. */ }
        };
    }
    internal void ShowDashboard()
    {
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
    }
    private void RefreshStartup()
    {
        if (startupButton == null) return;
        try {
            startupButton.Text = readStartup() ? Local("Start with Windows: ON", "开机自启：开启") : Local("Start with Windows: OFF", "开机自启：关闭");
        } catch {
            startupButton.Text = Local("Startup unavailable", "无法读取自启设置"); startupButton.Enabled = false;
        }
    }
    internal Button StartupButton { get { return startupButton; } }
    internal bool IsLocal(string address)
    {
        Uri uri;
        return Uri.TryCreate(address, UriKind.Absolute, out uri) && uri.Scheme == origin.Scheme
            && uri.Host == origin.Host && uri.Port == origin.Port && String.IsNullOrEmpty(uri.UserInfo);
    }
    private void ExternalLink(string address)
    {
        Uri uri;
        // Only normal web links may leave the desktop window; never shell schemes or local files.
        if (Uri.TryCreate(address, UriKind.Absolute, out uri) && uri.Scheme == "https" && String.IsNullOrEmpty(uri.UserInfo))
            openExternal(uri.AbsoluteUri);
    }
    internal async Task InitializeDashboard()
    {
        if (initializing || initialized || IsDisposed) return;
        initializing = true;
        try
        {
            if (rendererFailed)
            {
                Controls.Remove(view); view.Dispose();
                view = new WebView2(); view.Dock = DockStyle.Fill; view.DefaultBackgroundColor = BackColor;
                Controls.Add(view); fallback.BringToFront(); rendererFailed = false;
            }
            if (view.CoreWebView2 != null)
            {
                initialized = true; view.CoreWebView2.Navigate(origin.AbsoluteUri); return;
            }
            Directory.CreateDirectory(profile);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, profile, null);
            if (IsDisposed) return;
            await view.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;
            CoreWebView2 core = view.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) {
                if (!IsLocal(args.Uri)) {
                    args.Cancel = true; blockedNavigations.Add(args.NavigationId);
                    if (args.IsUserInitiated) ExternalLink(args.Uri);
                }
            };
            core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) {
                args.Handled = true;
                if (!args.IsUserInitiated) return;
                if (IsLocal(args.Uri)) core.Navigate(args.Uri); else ExternalLink(args.Uri);
            };
            core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args) {
                if (!IsLocal(args.Uri) || args.PermissionKind != CoreWebView2PermissionKind.Notifications)
                    args.State = CoreWebView2PermissionState.Deny;
            };
            core.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args) {
                if (IsDisposed) return;
                if (blockedNavigations.Remove(args.NavigationId)) return;
                fallback.Visible = !args.IsSuccess;
                if (!args.IsSuccess) {
                    initialized = false;
                    message.Text = Local("Dashboard unavailable. Start the collector from the tray, then retry.",
                        "面板暂时不可用。请从托盘启动采集，再点击重试。");
                }
            };
            core.ProcessFailed += delegate {
                if (IsDisposed) return;
                initialized = false; rendererFailed = true;
                message.Text = Local("The dashboard renderer stopped. Retry or open it in your browser.",
                    "面板渲染进程已停止，请重试或在浏览器中打开。");
                fallback.Visible = true;
            };
            initialized = true;
            core.Navigate(origin.AbsoluteUri);
        }
        catch (Exception error)
        {
            if (IsDisposed) return;
            message.Text = Local("The embedded dashboard needs Microsoft Edge WebView2 Runtime.\nInstall it, then retry, or open the dashboard in your browser.",
                "内置面板需要 Microsoft Edge WebView2 Runtime。\n安装后点击重试，也可在浏览器打开面板。");
            fallback.Visible = true;
            reportFailure("WebView2: " + error.Message);
        }
        finally { initializing = false; }
    }
    internal WebView2 Browser { get { return view; } }
}
