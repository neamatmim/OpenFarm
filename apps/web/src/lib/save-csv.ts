/** Hands a CSV to the person's own computer, named for what it is and the period it covers. */
export const saveCsv = (name: string, csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Some browsers start the download after the click has returned; let go of the file a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
