// Format CPU usage as percentage (e.g. 0.054 -> 5.4%)
export const formatCPU = (cpu) => {
  if (cpu == null) return "0.0%";
  return (cpu * 100).toFixed(1) + "%";
};

// Format Bytes to Gigabytes (e.g. for RAM)
export const formatBytesToGB = (bytes) => {
  if (!bytes) return "0.00 GB";
  return (bytes / (1024 ** 3)).toFixed(2) + " GB";
};

// Format network traffic (MB or GB based on size)
export const formatNetwork = (bytes) => {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 ** 2);
  if (mb > 1024) return (mb / 1024).toFixed(2) + " GB";
  return mb.toFixed(2) + " MB";
};

// Format Disk IO (R / W)
export const formatIO = (readBytes, writeBytes) => {
  if (readBytes == null || writeBytes == null) return "-";
  return `R: ${formatNetwork(readBytes)}/s / W: ${formatNetwork(writeBytes)}/s`;
};

// Format Pressure Stall (e.g. 1.2 -> 1.2%)
export const formatPressure = (value) => {
  if (value == null) return "0.00%";
  const p = Number(value);
  if (isNaN(p)) return "0.00%";
  return p.toFixed(2) + "%";
};

// Format Server LoadAvg
export const formatLoad = (load) => {
  if (load == null) return "0.00";
  const p = Number(load);
  if (isNaN(p)) return "0.00";
  return p.toFixed(2);
};

// Format Date uniformly to YYYY-MM-DD HH:mm:ss
export const formatDate = (date) => {
  if (!date) return "-";
  return date.toLocaleString("sv-SE");
};
