$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Net;
using System.Runtime.InteropServices;
public class FlowSocket {
  public string ip; public int port; public int pid; public string network;
  public FlowSocket(string a,int b,int c,string d) { ip=a;port=b;pid=c;network=d; }
}
public static class FlowTables {
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr p, ref int n, bool sort, int af, int cls, uint reserved);
  [DllImport("iphlpapi.dll")] static extern uint GetExtendedUdpTable(IntPtr p, ref int n, bool sort, int af, int cls, uint reserved);
  static int Port(byte[] b, int offset) { return b[offset]*256+b[offset+1]; }
  public static FlowSocket[] Read() {
    var all=new List<FlowSocket>();
    foreach (int af in new[]{2,23}) foreach (bool tcp in new[]{true,false}) {
      int n=0; uint code=tcp ? GetExtendedTcpTable(IntPtr.Zero,ref n,false,af,5,0) : GetExtendedUdpTable(IntPtr.Zero,ref n,false,af,1,0);
      if(n<4) continue;
      IntPtr p=Marshal.AllocHGlobal(n);
      try {
        code=tcp ? GetExtendedTcpTable(p,ref n,false,af,5,0) : GetExtendedUdpTable(p,ref n,false,af,1,0);
        if(code!=0) continue;
        byte[] data=new byte[n]; Marshal.Copy(p,data,0,n);
        int count=BitConverter.ToInt32(data,0);
        int row=tcp ? (af==2?24:56) : (af==2?12:28);
        for(int i=0;i<count;i++) {
          int o=4+i*row; if(o+row>n) break;
          int addr=o+(tcp&&af==2?4:0), len=af==2?4:16;
          byte[] bytes=new byte[len]; Array.Copy(data,addr,bytes,0,len);
          string ip=new IPAddress(bytes).ToString();
          int po=o+(af==2?(tcp?8:4):20), pid=o+(tcp?(af==2?20:52):(af==2?8:24));
          all.Add(new FlowSocket(ip,Port(data,po),BitConverter.ToInt32(data,pid),tcp?"tcp":"udp"));
        }
      } finally { Marshal.FreeHGlobal(p); }
    }
    return all.ToArray();
  }
}
'@
$iteration = 0
$processes = @()
while ($true) {
  try {
    if (($iteration % 5) -eq 0) {
      $processes = @(Get-CimInstance Win32_Process | ForEach-Object {
        @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = $_.Name; path = $_.ExecutablePath; born = $(if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }) }
      })
    }
    $packet = @{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); sockets = @([FlowTables]::Read()); processes = $processes }
    [Console]::WriteLine(($packet | ConvertTo-Json -Compress -Depth 5))
    $iteration++
  } catch {
    [Console]::WriteLine('{"error":"Windows process observation failed"}')
  }
  Start-Sleep -Milliseconds 1000
}
