using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

// Compiled separately from the distributable. Uses an isolated synthetic collector/profile.
internal static class NetwatchGuiSmoke
{
    private static string output;
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        output = args[2];
        List<string> failures = new List<string>();
        bool startupEnabled = false;
        DashboardWindow window = new DashboardWindow(args[0], args[1], delegate { }, delegate(string error) { failures.Add(error); },
            delegate { return startupEnabled; }, delegate(bool enabled) { startupEnabled = enabled; });
        window.Shown += async delegate {
            try
            {
                DateTime deadline = DateTime.UtcNow.AddSeconds(25);
                bool loaded = false;
                while (DateTime.UtcNow < deadline)
                {
                    await Task.Delay(150);
                    if (window.Browser.CoreWebView2 == null) continue;
                    string ready = await window.Browser.CoreWebView2.ExecuteScriptAsync("Boolean(document.querySelector('#totalBytes') && document.querySelector('#totalBytes').textContent.trim() !== '—')");
                    if (ready == "true") { loaded = true; break; }
                }
                if (!loaded) throw new Exception("Dashboard data did not render in WebView2.");
                if (failures.Count != 0) throw new Exception("WebView2 initialization failed.");
                window.StartupButton.PerformClick();
                if (!startupEnabled) throw new Exception("Startup button did not enable the preference.");
                window.StartupButton.PerformClick();
                if (startupEnabled) throw new Exception("Startup button did not disable the preference.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#language').value='en'; document.querySelector('#language').dispatchEvent(new Event('change'));");
                await Task.Delay(350);
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.documentElement.lang") != "\"en\"")
                    throw new Exception("English language selection failed.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#language').value='zh-CN'; document.querySelector('#language').dispatchEvent(new Event('change'));");
                await Task.Delay(350);
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.documentElement.lang") != "\"zh-CN\"")
                    throw new Exception("Chinese language selection failed.");
                if (!window.IsLocal(args[0] + "/api/health") || window.IsLocal("https://example.invalid/") || window.IsLocal("file:///C:/Windows/win.ini"))
                    throw new Exception("Desktop navigation isolation failed.");
                window.Browser.CoreWebView2.Navigate("https://example.invalid/");
                await Task.Delay(200);
                if (!window.IsLocal(window.Browser.CoreWebView2.Source)) throw new Exception("External navigation was not blocked.");
                bool downloaded = false;
                window.Browser.CoreWebView2.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) {
                    e.ResultFilePath = Path.Combine(args[1], "export.csv"); e.Handled = true; downloaded = true;
                };
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#exportButton').click()");
                deadline = DateTime.UtcNow.AddSeconds(5);
                while (!downloaded && DateTime.UtcNow < deadline) await Task.Delay(100);
                if (!downloaded) throw new Exception("CSV download did not start in WebView2.");
                deadline = DateTime.UtcNow.AddSeconds(5);
                while (!File.Exists(Path.Combine(args[1], "export.csv")) && DateTime.UtcNow < deadline) await Task.Delay(100);
                if (!File.Exists(Path.Combine(args[1], "export.csv")) || new FileInfo(Path.Combine(args[1], "export.csv")).Length == 0)
                    throw new Exception("CSV download did not save a file.");
                window.Close();
                if (window.Visible || window.IsDisposed) throw new Exception("Close-to-tray behavior failed.");
                window.ShowDashboard();
                if (!window.Visible) throw new Exception("Window did not reopen.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#toast')?.setAttribute('hidden',''); document.activeElement?.blur()");
                await Task.Delay(250);
                using (FileStream image = File.Create(args[3]))
                    await window.Browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, image);
                File.WriteAllText(output, "{\"status\":\"passed\",\"checks\":[\"real WebView2 dashboard data\",\"startup button on and off (injected preference)\",\"English and Chinese switch\",\"external navigation isolation\",\"CSV download\",\"close to tray and reopen\"]}");
                Environment.ExitCode = 0;
            }
            catch (Exception error)
            {
                File.WriteAllText(output, "GUI smoke failed: " + error.Message);
                Environment.ExitCode = 1;
            }
            finally { window.Dispose(); Application.ExitThread(); }
        };
        Application.Run(window); return Environment.ExitCode;
    }
}
