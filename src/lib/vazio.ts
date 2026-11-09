/*
 * Módulo vazio no lugar das dependências opcionais do jsPDF (html2canvas, dompurify, canvg).
 * Elas só servem para converter HTML e SVG em PDF, que este app não usa; sem isso o
 * build embutiria centenas de KB a mais no index.html.
 */
export default {};
