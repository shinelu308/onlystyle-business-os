/**
 * Excel 导入导出服务
 * 使用 exceljs 生成带样式的 .xlsx 文件（中文表头 + 蓝底白字 + 斑马纹）
 */
const ExcelJS = require('exceljs');

/** 表头中文映射 */
const HEADER_CN = {
  line_id: '线路编号', provider: '运营商', circuit_number: '电路编号',
  total_bandwidth: '总带宽(Mbps)', purchase_date: '采购日期', expire_date: '到期日期',
  cost_annual: '年成本(元)', install_location: '安装位置', remarks: '备注',
  node_id: '项目编号', node_name: '项目名称', node_type: '项目类型', associated_line: '关联线路',
  customer_id: '客户编号', company_name: '公司名称', cust_type: '客户类型',
  parent_id: '上级客户', wechat_openid: '微信OpenID', contact_person: '联系人',
  contact_phone: '联系电话', address: '地址',
  contract_id: '合同编号', biz_type: '业务类型', allocated_bw: '带宽(Mbps)',
  start_date: '生效日期', duration_months: '签约周期(月)', monthly_fee: '费用(元)',
  billing_cycle: '计费周期'
};

/**
 * 生成带样式的 .xlsx 文件 Buffer
 */
async function generateXlsx(fieldKeys, dataRows) {
  var headers = fieldKeys.map(function(k) { return HEADER_CN[k] || k; });
  var wb = new ExcelJS.Workbook();
  wb.creator = 'BOS';
  wb.created = new Date();
  var ws = wb.addWorksheet('Sheet1');

  // 蓝色表头样式
  var headerStyle = {
    font: { name: '微软雅黑', size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      left: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      right: { style: 'thin', color: { argb: 'FF1D4ED8' } }
    }
  };

  // 数据行样式
  var dataStyle = {
    font: { name: '微软雅黑', size: 11 },
    alignment: { vertical: 'middle' },
    border: {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    }
  };
  var altDataStyle = JSON.parse(JSON.stringify(dataStyle));
  altDataStyle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

  // 写入表头
  var headerRow = ws.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell(function(cell) { cell.style = headerStyle; });

  // 写入数据行
  for (var r = 0; r < dataRows.length; r++) {
    var row = ws.addRow(dataRows[r].map(function(v) { return v || ''; }));
    row.height = 22;
    var useAlt = r % 2 === 1;
    row.eachCell(function(cell) { cell.style = useAlt ? altDataStyle : dataStyle; });
  }

  // 设置列宽
  for (var c = 0; c < headers.length; c++) {
    ws.getColumn(c + 1).width = 18;
  }

  return await wb.xlsx.writeBuffer();
}

/**
 * 发送 .xlsx 文件响应
 */
function sendExcelResponse(res, filename, buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(filename));
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

/** ===== 中文 → 英文 反向映射（导入时将中文表头转回英文字段名）===== */
var REVERSE_HEADER_CN = {};
for (var key in HEADER_CN) {
  REVERSE_HEADER_CN[HEADER_CN[key]] = key;
}

/**
 * 解析 xlsx 文件 Buffer，自动将中文表头映射回英文字段名
 */
async function parseXlsx(buffer) {
  var wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  var ws = wb.worksheets[0];
  if (!ws) return [];

  // 读取表头行（第1行）
  var headerRow = ws.getRow(1);
  var headers = [];
  headerRow.eachCell(function(cell) {
    var h = cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
    headers.push(h);
  });

  // 将中文表头映射为英文字段名
  var fieldKeys = headers.map(function(h) {
    return REVERSE_HEADER_CN[h] || h;
  });

  var result = [];
  for (var r = 2; r <= ws.rowCount; r++) {
    var row = ws.getRow(r);
    var isEmpty = true;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var cell = row.getCell(c + 1);
      var val = cell.value;
      var strVal = (val !== null && val !== undefined) ? String(val).trim() : '';
      if (strVal !== '') isEmpty = false;
      obj[fieldKeys[c]] = strVal;
    }
    if (!isEmpty) result.push(obj);
  }
  return result;
}

/**
 * 统一导入解析入口
 * data: CSV 文本 或 xlsx 的 base64 字符串
 * format: 'csv' 或 'xlsx'
 */
async function parseImportData(data, format) {
  if (format === 'xlsx') {
    var buffer = Buffer.from(data, 'base64');
    return await parseXlsx(buffer);
  }
  return parseCsv(data);
}

module.exports = { generateXlsx, sendExcelResponse, HEADER_CN, parseCsv, parseXlsx, parseImportData };

/** ===== CSV 解析（导入功能仍用 CSV 格式）===== */
function parseCsv(csvText) {
  var lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  var headerLine = lines[0].replace(/^\uFEFF/, '');
  var rawHeaders = parseCsvLine(headerLine);
  // 将中文表头映射为英文字段名（同时兼容英文表头）
  var headers = rawHeaders.map(function(h) {
    return REVERSE_HEADER_CN[h] || h;
  });
  var result = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var fields = parseCsvLine(line);
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = (j < fields.length) ? fields[j] : '';
    }
    result.push(row);
  }
  return result;
}

function parseCsvLine(line) {
  var fields = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}
