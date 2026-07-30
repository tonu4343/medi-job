(function () {
  "use strict";

  function value(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback || "記載なし";
  }

  function list(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (error) {}
    }
    return [];
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function addTextSection(root, title, content) {
    const section = node("section", "pdf-section");
    section.appendChild(node("h2", "", title));
    section.appendChild(node("p", "pdf-copy", value(content)));
    root.appendChild(section);
  }

  function addSimpleTable(root, title, rows, columns) {
    const section = node("section", "pdf-section");
    section.appendChild(node("h2", "", title));
    const table = node("table", "pdf-table");
    const thead = node("thead");
    const headRow = node("tr");
    columns.forEach(function (column) { headRow.appendChild(node("th", "", column.label)); });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = node("tbody");
    const items = list(rows);
    if (!items.length) {
      const tr = node("tr");
      const td = node("td", "pdf-empty", "記載なし");
      td.colSpan = columns.length;
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      items.forEach(function (item) {
        const tr = node("tr");
        columns.forEach(function (column) { tr.appendChild(node("td", "", value(item[column.key], "-"))); });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    section.appendChild(table);
    root.appendChild(section);
  }

  function createDocument(options) {
    const profile = options.profile || {};
    const resume = options.resume || {};
    const root = node("article", "resume-pdf-document");
    const style = node("style");
    style.textContent = [
      ".resume-pdf-document{width:180mm;box-sizing:border-box;padding:8mm 9mm;background:#fff;color:#17324d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP','Yu Gothic',sans-serif;font-size:10.5pt;line-height:1.65}",
      ".pdf-header{display:flex;justify-content:space-between;gap:16mm;align-items:flex-start;padding-bottom:7mm;border-bottom:2px solid #005bac}",
      ".pdf-header h1{margin:0;color:#005bac;font-size:23pt;line-height:1.25;letter-spacing:.04em}",
      ".pdf-header p{margin:2mm 0 0;color:#577086;font-size:9pt}",
      ".pdf-meta{min-width:66mm;border:1px solid #cbdde9;border-radius:2mm;overflow:hidden}",
      ".pdf-meta div{display:grid;grid-template-columns:22mm 1fr;border-bottom:1px solid #e2edf4}",
      ".pdf-meta div:last-child{border-bottom:0}",
      ".pdf-meta b,.pdf-meta span{padding:2mm 2.5mm}",
      ".pdf-meta b{background:#f2f8fc;color:#31526d;font-size:8.5pt}",
      ".pdf-section{margin-top:7mm;break-inside:avoid}",
      ".pdf-section h2{margin:0 0 3mm;padding:0 0 2mm;color:#005bac;font-size:14pt;border-bottom:1px solid #9fc7e4}",
      ".pdf-copy{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}",
      ".pdf-table{width:100%;border-collapse:collapse;table-layout:fixed}",
      ".pdf-table th,.pdf-table td{padding:2.4mm 2.6mm;border:1px solid #cbdde9;text-align:left;vertical-align:top;overflow-wrap:anywhere}",
      ".pdf-table th{background:#eef6fb;color:#31526d;font-size:9pt}",
      ".pdf-table td{font-size:9.5pt}",
      ".pdf-table th:first-child,.pdf-table td:first-child{width:30mm}",
      ".pdf-empty{text-align:center!important;color:#718697}",
      ".pdf-footer{margin-top:9mm;padding-top:3mm;border-top:1px solid #dce8f0;color:#718697;font-size:8pt;text-align:right}",
      "@media print{.resume-pdf-document{width:auto;padding:0}}"
    ].join("");
    root.appendChild(style);

    const header = node("header", "pdf-header");
    const heading = node("div");
    heading.appendChild(node("h1", "", "履歴書・職務経歴書"));
    heading.appendChild(node("p", "", "MEDICAL SPOT JOB"));
    header.appendChild(heading);
    const meta = node("div", "pdf-meta");
    [
      ["氏名", options.name || profile.name],
      ["資格・職種", profile.license],
      ["生年月日", profile.birth_date],
      ["電話番号", profile.phone],
      ["メール", profile.email || options.email]
    ].forEach(function (row) {
      const line = node("div");
      line.appendChild(node("b", "", row[0]));
      line.appendChild(node("span", "", value(row[1])));
      meta.appendChild(line);
    });
    header.appendChild(meta);
    root.appendChild(header);

    addSimpleTable(root, "学歴", resume.education, [
      { key: "date", label: "年月" },
      { key: "detail", label: "学校名・学部・内容" }
    ]);
    addSimpleTable(root, "免許・資格", resume.licenses, [
      { key: "date", label: "取得年月" },
      { key: "detail", label: "免許・資格" }
    ]);
    addTextSection(root, "本人希望", resume.wishes);
    addTextSection(root, "職務要約", resume.work_summary);
    addSimpleTable(root, "職務経歴", resume.work_history, [
      { key: "period", label: "期間" },
      { key: "company", label: "勤務先" },
      { key: "role", label: "部署・役職" },
      { key: "detail", label: "業務内容・実績" }
    ]);
    addTextSection(root, "活かせる経験・知識・スキル", resume.skills_text);
    addTextSection(root, "自己PR", resume.pr);
    root.appendChild(node("footer", "pdf-footer", "作成日：" + new Date().toLocaleDateString("ja-JP")));
    return root;
  }

  function safeFilename(name) {
    return value(name, "求職者").replace(/[\\/:*?"<>|]/g, "_") + "_履歴書・職務経歴書.pdf";
  }

  function printFallback(element, filename) {
    const popup = window.open("", "_blank", "width=900,height=760");
    if (!popup) throw new Error("PDF画面を開けません。ポップアップを許可してください。");
    popup.document.write("<!DOCTYPE html><html lang=\"ja\"><head><meta charset=\"UTF-8\"><title>" + filename + "</title></head><body></body></html>");
    popup.document.body.appendChild(element);
    popup.document.close();
    popup.focus();
    setTimeout(function () { popup.print(); }, 250);
  }

  async function download(options) {
    const element = createDocument(options || {});
    const filename = safeFilename(options && options.name);
    if (typeof window.html2pdf !== "function") {
      printFallback(element, filename);
      return;
    }
    await window.html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-section", "tr"] }
    }).from(element).save();
  }

  window.MEDISPOT_RESUME_PDF = { createDocument: createDocument, download: download };
})();
