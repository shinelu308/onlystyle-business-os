// ===== 组织架构管理（ES5 兼容）=====
function renderDepartments() {
  var body = $('contentBody');
  var p1 = API.get('/api/departments/tree');
  var p2 = API.get('/api/departments');
  var tree = null, flat = null;
  function renderTree(nodes, level) {
    if (level === undefined) level = 0;
    var html = '';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var hasChildren = n.children && n.children.length > 0;
      var icon = n.parent_id ? '\uD83D\uDCC2' : '\uD83C\uDFE2';
      var headInfo = n.dept_head ? '负责人: ' + escapeHtml(n.dept_head) : '';
      var descInfo = n.description ? '| ' + escapeHtml(n.description) : '';
      html += '<div class="dept-tree-item" style="padding-left:' + (level * 24 + 16) + 'px">' +
        '<div class="dept-tree-row">' +
          '<span class="dept-tree-icon">' + icon + '</span>' +
          '<span class="dept-tree-name">' + escapeHtml(n.dept_name) + '</span>' +
          '<span class="badge info" style="margin-left:8px">' + n.staff_count + '人</span>' +
          '<span class="dept-tree-meta">' + headInfo + ' ' + descInfo + '</span>' +
          '<div class="btn-group" style="margin-left:auto">' +
            '<button class="btn btn-sm btn-ghost" onclick="showDeptForm(\'' + n.dept_id + '\')">编辑</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteDept(\'' + n.dept_id + '\')">删除</button></div></div></div>';
      if (hasChildren) html += renderTree(n.children, level + 1);
    }
    return html;
  }
  function done() {
    if (!tree || !flat) return;
    body.innerHTML = '<div class="card">' +
      '<div class="card-header"><h3>\uD83C\uDFDB\uFE0F 组织架构</h3><button class="btn btn-primary btn-sm" onclick="showDeptForm()">+ 新增部门</button></div>' +
      '<div class="card-body">' +
        '<div class="dept-stats mb-4"><span class="badge info">总部门: ' + flat.length + '</span></div>' +
        '<div class="dept-tree-container">' + renderTree(tree) + '</div></div></div>';
  }
  p1.then(function(d) { tree = d; done(); });
  p2.then(function(d) { flat = d; done(); });
}

window.showDeptForm = function(id) {
  var data = { dept_id: '', dept_name: '', parent_id: '', dept_head: '', description: '', sort_order: '' };
  var isEdit = false;
  function afterParents(parents) {
    if (id) {
      API.get('/api/departments/' + id).then(function(resp) {
        data = resp;
        isEdit = true;
        openForm(parents);
      });
    } else {
      openForm(parents);
    }
  }
  function openForm(parents) {
    var parentOpts = '<option value="">（顶级部门）</option>';
    for (var i = 0; i < parents.length; i++) {
      if (parents[i].dept_id !== id) {
        var sel = data.parent_id === parents[i].dept_id ? ' selected' : '';
        parentOpts += '<option value="' + parents[i].dept_id + '"' + sel + '>' + escapeHtml(parents[i].dept_name) + '</option>';
      }
    }
    openModal(isEdit ? '编辑部门' : '新增部门',
      '<form id="deptForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">部门编号</label><input name="dept_id" value="' + data.dept_id + '" ' + (isEdit ? 'readonly style="background:#f1f5f9"' : 'required placeholder="如 DEPT-010"') + '></div>' +
        '<div class="form-group"><label class="required">部门名称</label><input name="dept_name" required value="' + escapeHtml(data.dept_name) + '" placeholder="如 人事部"></div>' +
        '<div class="form-group"><label>上级部门</label><select name="parent_id">' + parentOpts + '</select></div>' +
        '<div class="form-group"><label>排序号</label><input name="sort_order" type="number" value="' + (data.sort_order || '') + '" placeholder="数字越小越靠前"></div>' +
        '<div class="form-group"><label>部门负责人</label><input name="dept_head" value="' + escapeHtml(data.dept_head) + '" placeholder="负责人姓名"></div>' +
        '<div class="form-group full"><label>部门描述</label><input name="description" value="' + escapeHtml(data.description) + '" placeholder="部门职责简述"></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitDept(\'' + isEdit + '\')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');
  }
  API.get('/api/departments').then(function(parents) { afterParents(parents); });
};

window.submitDept = function(isEdit) {
  var form = document.querySelector('#deptForm');
  var data = formToObject(form);
  var req = (isEdit === 'true' || isEdit === true)
    ? API.put('/api/departments/' + data.dept_id, data)
    : API.post('/api/departments', data);
  req.then(function() {
    closeModal();
    renderDepartments();
  });
};

window.deleteDept = function(id) {
  showConfirm('确认删除该部门及其所有子部门？', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/departments/' + id).then(function() {
      renderDepartments();
    });
  });
};
