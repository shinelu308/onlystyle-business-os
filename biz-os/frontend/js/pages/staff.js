// ===== 人员管理（ES5 兼容）=====
function renderStaff() {
  var body = $('contentBody');
  var p1 = API.get('/api/staff');
  var p2 = API.get('/api/departments');
  var staff = null, depts = null;
  function done() {
    if (!staff || !depts) return;
    var roleMap = { admin: '管理员', manager: '经理', operator: '专员', viewer: '观察员' };
    var roleClsMap = { admin: 'danger', manager: 'warning', operator: 'info', viewer: 'secondary' };
    var rows = '';
    for (var i = 0; i < staff.length; i++) {
      var s = staff[i];
      var roleCls = roleClsMap[s.role] || 'secondary';
      var roleLabel = roleMap[s.role] || s.role;
      var statusLabel = s.status === 'active' ? '<span class="badge success">启用</span>' : '<span class="badge secondary">禁用</span>';
      rows += '<tr>' +
        '<td><strong>' + s.staff_id + '</strong></td>' +
        '<td>' + escapeHtml(s.name) + '</td>' +
        '<td><code>' + escapeHtml(s.username) + '</code></td>' +
        '<td>' + escapeHtml(s.dept_name || '-') + '</td>' +
        '<td>' + escapeHtml(s.position || '-') + '</td>' +
        '<td><span class="badge ' + roleCls + '">' + roleLabel + '</span></td>' +
        '<td>' + escapeHtml(s.phone || '-') + '</td>' +
        '<td>' + escapeHtml(s.email || '-') + '</td>' +
        '<td>' + statusLabel + '</td>' +
        '<td><div class="btn-group"><button class="btn btn-sm btn-ghost" onclick="showStaffForm(\'' + s.staff_id + '\')">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteStaff(\'' + s.staff_id + '\')">删除</button></div></td></tr>';
    }
    body.innerHTML =
      '<div class="card">' +
        '<div class="card-header"><h3>\uD83D\uDC65 人员列表</h3><button class="btn btn-primary btn-sm" onclick="showStaffForm()">+ 新增人员</button></div>' +
        '<div class="card-body"><div class="table-wrapper"><table>' +
          '<thead><tr><th>编号</th><th>姓名</th><th>账号</th><th>部门</th><th>职位</th><th>角色</th><th>电话</th><th>邮箱</th><th>状态</th><th>操作</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div></div></div>';
  }
  p1.then(function(d) { staff = d; done(); });
  p2.then(function(d) { depts = d; done(); });
}

window.showStaffForm = function(id) {
  var data = { staff_id: '', name: '', username: '', password: '', phone: '', email: '', dept_id: '', position: '', role: 'operator' };
  var isEdit = false;
  var depts = [];

  function openForm() {
    var deptOpts = '<option value="">（未分配）</option>';
    for (var i = 0; i < depts.length; i++) {
      var sel = data.dept_id === depts[i].dept_id ? ' selected' : '';
      deptOpts += '<option value="' + depts[i].dept_id + '"' + sel + '>' + escapeHtml(depts[i].dept_name) + '</option>';
    }
    var pwField = isEdit
      ? '<div class="form-group full"><label>新密码（留空不修改）</label><input name="password" type="password" placeholder="留空则不修改密码"></div>'
      : '<div class="form-group full"><label>密码</label><input name="password" type="password" required placeholder="输入登录密码"></div>';
    openModal(isEdit ? '编辑人员' : '新增人员',
      '<form id="staffForm" class="form-grid" onsubmit="return false">' +
        '<div class="form-group"><label class="required">人员编号</label><input name="staff_id" value="' + data.staff_id + '" ' + (isEdit ? 'readonly style="background:#f1f5f9"' : 'required placeholder="如 STAFF-011"') + '></div>' +
        '<div class="form-group"><label class="required">姓名</label><input name="name" required value="' + escapeHtml(data.name) + '" placeholder="真实姓名"></div>' +
        '<div class="form-group"><label class="required">登录账号</label><input name="username" required value="' + escapeHtml(data.username) + '" ' + (isEdit ? 'readonly style="background:#f1f5f9"' : 'placeholder="英文/数字"') + '></div>' + pwField +
        '<div class="form-group"><label>手机号</label><input name="phone" value="' + escapeHtml(data.phone) + '" placeholder="手机号"></div>' +
        '<div class="form-group"><label>邮箱</label><input name="email" value="' + escapeHtml(data.email) + '" placeholder="邮箱"></div>' +
        '<div class="form-group"><label>所属部门</label><select name="dept_id">' + deptOpts + '</select></div>' +
        '<div class="form-group"><label>职位</label><input name="position" value="' + escapeHtml(data.position) + '" placeholder="如 销售专员"></div>' +
        '<div class="form-group"><label>角色权限</label><select name="role"><option value="admin"' + (data.role === 'admin' ? ' selected' : '') + '>管理员 - 系统全部权限</option><option value="manager"' + (data.role === 'manager' ? ' selected' : '') + '>经理 - 查看+编辑权限</option><option value="operator"' + (data.role === 'operator' ? ' selected' : '') + '>专员 - 查看+基础操作</option><option value="viewer"' + (data.role === 'viewer' ? ' selected' : '') + '>观察员 - 仅查看</option></select></div>' +
        '<div class="form-group"><label>状态</label><select name="status"><option value="active"' + (data.status !== 'disabled' ? ' selected' : '') + '>启用</option><option value="disabled"' + (data.status === 'disabled' ? ' selected' : '') + '>禁用</option></select></div>' +
        '<div class="form-actions full"><button class="btn btn-outline" type="button" onclick="closeModal()">取消</button><button class="btn btn-primary" type="button" onclick="submitStaff(\'' + isEdit + '\')">' + (isEdit ? '保存修改' : '创建') + '</button></div></form>');
  }

  var loadDepts = function() {
    return API.get('/api/departments');
  };
  loadDepts().then(function(d) {
    depts = d;
    if (id) {
      API.get('/api/staff/' + id).then(function(resp) {
        data = resp;
        isEdit = true;
        openForm();
      });
    } else {
      openForm();
    }
  });
};

window.submitStaff = function(isEdit) {
  var form = document.querySelector('#staffForm');
  var data = formToObject(form);
  var req = (isEdit === 'true' || isEdit === true)
    ? API.put('/api/staff/' + data.staff_id, data)
    : API.post('/api/staff', data);
  req.then(function() {
    closeModal();
    renderStaff();
  }).catch(function(e) {
    showAlert('操作失败: ' + e.message);
  });
};

window.deleteStaff = function(id) {
  showConfirm('确认删除该人员？', function(confirmed) {
    if (!confirmed) return;
    API.del('/api/staff/' + id).then(function() {
      renderStaff();
    });
  });
};
