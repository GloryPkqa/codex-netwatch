using System;
using Microsoft.Win32;

// Per-user Windows login startup. Reading the preference never creates registry values.
internal sealed class StartupRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "CodexNetwatch";
    private readonly string command;
    internal StartupRegistration(string executable)
    {
        command = "\"" + executable + "\" --no-browser";
    }
    internal bool Enabled
    {
        get
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, false))
                return key != null && String.Equals(key.GetValue(ValueName) as string, command, StringComparison.OrdinalIgnoreCase);
        }
    }
    internal void SetEnabled(bool enabled)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey))
        {
            if (enabled) key.SetValue(ValueName, command, RegistryValueKind.String);
            else if (String.Equals(key.GetValue(ValueName) as string, command, StringComparison.OrdinalIgnoreCase))
                key.DeleteValue(ValueName, false);
        }
        if (Enabled != enabled) throw new InvalidOperationException("Windows startup preference could not be saved.");
    }
}
