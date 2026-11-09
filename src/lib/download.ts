/** Baixa um arquivo gerado no próprio aparelho (backup, PDF, lista de conferência). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // O link precisa existir até o navegador começar o download; liberar na hora cancela em alguns celulares.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
