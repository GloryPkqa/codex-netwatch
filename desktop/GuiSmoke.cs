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
        bool simulateStartupFailure = false;
        DashboardWindow window = new DashboardWindow(args[0], args[1], delegate { }, delegate(string error) { failures.Add(error); },
            delegate { if (simulateStartupFailure) throw new InvalidOperationException("Synthetic preference read failure"); return startupEnabled; }, delegate(bool enabled) { startupEnabled = enabled; });
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
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.documentElement.lang === 'en' && document.querySelector('#language').value === 'en'") != "true")
                    throw new Exception("A fresh desktop profile did not default to English.");
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('.version-link')?.href === 'https://github.com/GloryPkqa/codex-netwatch' && document.querySelector('.version-link').textContent.includes('codex-netwatch')") != "true")
                    throw new Exception("Sidebar project link is missing or points to the wrong repository.");
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#processScope').value === 'codex' && !document.querySelector('#processRows').textContent.includes('browser.exe') && document.querySelector('#processRows').textContent.includes('codex.exe')") != "true")
                    throw new Exception("Process ranking did not default to Codex only.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#processScope').value='all'; document.querySelector('#processScope').dispatchEvent(new Event('change'))");
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#processRows').textContent.includes('browser.exe')") != "true")
                    throw new Exception("All-proxy process comparison did not show the other app.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#processScope').value='codex'; document.querySelector('#processScope').dispatchEvent(new Event('change'))");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#settingsButton').click()");
                deadline = DateTime.UtcNow.AddSeconds(5);
                while (DateTime.UtcNow < deadline) {
                    if (await window.Browser.CoreWebView2.ExecuteScriptAsync("!document.querySelector('#desktopSettings').hidden && !document.querySelector('#startupToggle').disabled") == "true") break;
                    await Task.Delay(100);
                }
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupToggle').click()");
                await Task.Delay(250);
                if (!startupEnabled || await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupToggle').getAttribute('aria-checked')") != "\"true\"")
                    throw new Exception("Settings startup switch did not enable the preference.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupToggle').click()");
                await Task.Delay(250);
                if (startupEnabled) throw new Exception("Settings startup switch did not disable the preference.");
                simulateStartupFailure = true;
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#closeSettings').click(); document.querySelector('#settingsButton').click()");
                deadline = DateTime.UtcNow.AddSeconds(5);
                bool unavailable = false;
                while (DateTime.UtcNow < deadline) {
                    if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupToggle').disabled && ['暂不可用','Unavailable'].includes(document.querySelector('#startupState').textContent)") == "true") { unavailable = true; break; }
                    await Task.Delay(100);
                }
                if (!unavailable) throw new Exception("Unavailable startup state was not shown.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#language').value='en'; document.querySelector('#language').dispatchEvent(new Event('change'));");
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupState').textContent") != "\"Unavailable\"")
                    throw new Exception("Language switch replaced an unavailable startup state with an OFF preference.");
                simulateStartupFailure = false;
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#closeSettings').click(); document.querySelector('#settingsButton').click()");
                deadline = DateTime.UtcNow.AddSeconds(5);
                while (DateTime.UtcNow < deadline && await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupToggle').disabled") == "true") await Task.Delay(100);
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#startupToggle').disabled") != "false")
                    throw new Exception("Startup setting did not recover after retry.");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#closeSettings').click()");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#language').value='en'; document.querySelector('#language').dispatchEvent(new Event('change'));");
                await Task.Delay(350);
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.documentElement.lang") != "\"en\"")
                    throw new Exception("English language selection failed.");
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#processTitle').textContent") != "\"Codex traffic by process\"")
                    throw new Exception("Process ranking title did not follow the selected language.");
                System.Drawing.Size originalSize = window.ClientSize;
                window.ClientSize = new System.Drawing.Size(800, 700);
                await Task.Delay(200);
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.documentElement.scrollWidth <= window.innerWidth") != "true")
                    throw new Exception("Narrow desktop layout overflowed the window.");
                window.ClientSize = originalSize;
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
                if (args.Length > 4 && args[4] == "en")
                    await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('#language').value='en'; document.querySelector('#language').dispatchEvent(new Event('change'));");
                await window.Browser.CoreWebView2.ExecuteScriptAsync("window.scrollTo({top:document.querySelector('#investigation').offsetTop-110,behavior:'instant'})");
                await Task.Delay(250);
                if (await window.Browser.CoreWebView2.ExecuteScriptAsync("document.querySelector('.nav-link[aria-current]').getAttribute('href')") != "\"#investigation\"")
                    throw new Exception("Sidebar selection did not follow scrolling.");
                using (FileStream image = File.Create(args[3]))
                    await window.Browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, image);
                await window.Browser.CoreWebView2.ExecuteScriptAsync("window.scrollTo({top:0,behavior:'instant'})");
                await Task.Delay(200);
                using (FileStream image = File.Create(Path.ChangeExtension(args[3], ".overview.png")))
                    await window.Browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, image);
                File.WriteAllText(output, "{\"status\":\"passed\",\"checks\":[\"real WebView2 dashboard data\",\"Codex-only default and all-proxy ranking switch\",\"sidebar follows scroll\",\"startup switch (injected preference)\",\"English and Chinese switch\",\"external navigation isolation\",\"CSV download\",\"close to tray and reopen\"]}");
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
