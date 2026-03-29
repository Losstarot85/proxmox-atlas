// Formatta l'uso della CPU in percentuale (es. 0.054 -> 5.4%)
export const formatCPU = (cpu) => {
  if (cpu == null) return "0.0%";
  return (cpu * 100).toFixed(1) + "%";
};

// Formatta i Byte in Gigabyte (es. per la RAM)
export const formatBytesToGB = (bytes) => {
  if (!bytes) return "0.00 GB";
  return (bytes / (1024 ** 3)).toFixed(2) + " GB";
};

// Formatta il traffico di rete (MB o GB in base alla grandezza)
export const formatNetwork = (bytes) => {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 ** 2);
  if (mb > 1024) return (mb / 1024).toFixed(2) + " GB";
  return mb.toFixed(2) + " MB";
};
