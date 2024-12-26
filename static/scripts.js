const showDialog = (title, msg) => {
    const dialog = document.querySelector('#dialog');
    const dialogTitle = document.querySelector('#dialog .dialog-title');
    const dialogBody = document.querySelector('#dialog .dialog-content');
    dialogTitle.textContent = title;
    dialogBody.textContent = msg;
    dialog.showModal();
}

const showConfirmDialog = (title, msg) => {
    const dialog = document.querySelector('#confirm-dialog');
    const dialogTitle = document.querySelector('#confirm-dialog .dialog-title');
    const dialogBody = document.querySelector('#confirm-dialog .dialog-content');
    const yes = document.querySelector('#confirm-dialog-yes');
    const no = document.querySelector('#confirm-dialog-no');
    const promise = new Promise(res => {
        const yesCallback = () => {
            res(true);
            clearCallback();
        };
        const noCallback = () => {
            res(false);
            clearCallback();
        };
        const clearCallback = () => {
            console.log('clear callback');
            yes.removeEventListener('click', yesCallback);
            no.removeEventListener('click', noCallback);
            dialog.close();
        }
        yes.addEventListener('click', yesCallback);
        no.addEventListener('click', noCallback);
    });
    
    dialogTitle.textContent = title;
    dialogBody.textContent = msg;
    dialog.showModal();
    return promise;
}

// 添加分页相关的全局变量
let currentPage = 1;
let pageSize = 10;
let allCourses = [];

document.addEventListener("DOMContentLoaded", function () {
    document.querySelector(".add-course").addEventListener("click", function() {
        addCourseEntry();
    });
    document.getElementById("fetch-courses-btn").addEventListener("click", fetchCourses);
    document.getElementById("start-qk-btn").addEventListener("click", start);
    document.getElementById("stop-qk-btn").addEventListener("click", stop);
    checkCoursesCount();

    // 添加分页控件的事件监听
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            displayCurrentPage();
            updatePagination();
        }
    });

    document.getElementById('next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(allCourses.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            displayCurrentPage();
            updatePagination();
        }
    });

    document.getElementById('page-size').addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1; // 重置到第一页
        displayCurrentPage();
        updatePagination();
    });
});

function addCourseEntry() {
    const courseEntry = document.createElement("div");
    courseEntry.className = "course-entry";
    courseEntry.innerHTML = `
        <input type="text" name="kcrwdm" placeholder="课程ID" required>
        <input type="text" name="kcmc" placeholder="课程名称" required>
        <input type="text" name="teacher" placeholder="老师名字" required>
        <input type="text" name="remark" placeholder="备注">
        <input type="hidden" name="preset" value="false">
        <button type="button" class="btn remove-course" onclick="this.parentElement.remove()">-</button>
    `;
    document.getElementById("courses-container").appendChild(courseEntry);
    checkCoursesCount();
}

function checkCoursesCount() {
    const courseEntries = document.querySelectorAll(".course-entry");
    const removeButtons = document.querySelectorAll(".remove-course");

    if (courseEntries.length <= 1) {
        removeButtons.forEach(button => {
            button.disabled = false;
        });
    } else {
        removeButtons.forEach(button => {
            button.disabled = false;
        });
    }
}

function fetchCourses() {
    const cookie = document.getElementById("cookie").value;
    if (!cookie) {
        showDialog('提示', "请先输入 Cookie");
        return;
    }

    fetch('/fetch_courses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ 'cookie': cookie })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showDialog('错误', data.error);
            } else {
                updateAvailableCourses(data.available_courses);
            }
        })
        .catch(error => {
            console.error('获取课程列表失败:', error);
            showDialog('错误', '获取课程列表失败，请查看控制台错误信息。');
        });
}

function updateAvailableCourses(courses) {
    allCourses = courses; // 保存所有课程数据
    updatePagination();
    displayCurrentPage();
}

function displayCurrentPage() {
    const tableBody = document.getElementById("available-courses-list");
    tableBody.innerHTML = ''; // 清空当前列表

    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, allCourses.length);
    
    for (let i = start; i < end; i++) {
        const course = allCourses[i];
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${course.kcrwdm}</td>
            <td>${course.kcmc}</td>
            <td>${course.xmmc}</td>
            <td>${course.teaxm}</td>
            <td>${course.kcdlmc}(${course.kcdm})</td>
            <td>${course.pkrs}</td>
            <td>
                <form action="/add_course" method="post">
                    <input type="hidden" name="kcrwdm" value="${course.kcrwdm}">
                    <input type="hidden" name="kcmc" value="${course.kcmc}">
                    <input type="hidden" name="teacher" value="${course.teaxm || '未知'}">
                    <input type="hidden" name="preset" value="true">
                    <input type="hidden" name="remark" value="">
                    <button type="submit" class="btn">添加</button>
                </form>
            </td>
        `;
        tableBody.appendChild(row);
    }
}

function updatePagination() {
    const totalPages = Math.ceil(allCourses.length / pageSize);
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const currentPageSpan = document.getElementById('current-page');
    const totalPagesSpan = document.getElementById('total-pages');

    currentPageSpan.textContent = currentPage;
    totalPagesSpan.textContent = totalPages;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

function addCourse(button) {
    const form = button.closest('form');
    const formData = new FormData(form);

    fetch('/add_course', {
            method: 'POST',
            body: new URLSearchParams(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showDialog('错误', data.error);
            } else {
                showDialog('信息', '课程添加成功');
                updateCoursesList(data);
            }
        })
        .catch(error => {
            console.error('添加课程失败:', error);
            showDialog('错误', '添加课程失败，请查看控制台错误信息。');
        });
}

function updateCoursesList(course) {
    const coursesContainer = document.getElementById("courses-container");
    const newCourseEntry = document.createElement("div");
    newCourseEntry.className = "course-entry";
    if (course.preset) {
        newCourseEntry.classList.add("preset");
    }

    if (course.preset) {
        newCourseEntry.innerHTML = `
            <input type="text" name="kcrwdm" value="${course.kcrwdm}" readonly>
            <input type="text" name="kcmc" value="${course.kcmc}" readonly>
            <input type="text" name="teacher" value="${course.teacher}" readonly>
            <input type="text" name="remark" value="${course.remark}">
            <input type="hidden" name="preset" value="true">
            <button type="button" class="btn remove-course" onclick="this.parentElement.remove()">-</button>
            <button type="button" class="btn save-remark" onclick="saveRemark(${course.kcrwdm})">保存备注</button>
        `;
    } else {
        newCourseEntry.innerHTML = `
            <input type="text" name="kcrwdm" value="${course.kcrwdm}" required>
            <input type="text" name="kcmc" value="${course.kcmc}" required>
            <input type="text" name="teacher" value="${course.teacher}" required>
            <input type="text" name="remark" value="${course.remark}">
            <input type="hidden" name="preset" value="false">
            <button type="button" class="btn remove-course" onclick="this.parentElement.remove()">-</button>
        `;
    }

    coursesContainer.appendChild(newCourseEntry);
    checkCoursesCount();
}

function start() {
    fetch('/start', {
            method: 'POST',
        })
        .then(response => response.json())
        .then(data => {
            showDialog('信息', data.message);
        })
        .catch(error => {
            console.error('启动抢课失败:', error);
            showDialog('错误', '启动抢课失败，请查看控制台错误信息。');
        });
}

function stop() {
    fetch('/stop', {
            method: 'POST',
        })
        .then(response => response.json())
        .then(data => {
            showDialog('信息', data.message);
        })
        .catch(error => {
            console.error('停止抢课失败:', error);
            showDialog('错误', '停止抢课失败，请查看控制台错误信息。');
        });
}

async function fetchLogs() {
    try {
        let response = await fetch('/latest_log');
        let data = await response.json();
        let logContainer = document.getElementById('log-container');
        logContainer.innerText = data.logs;

        // 自动滚动到底部
        logContainer.scrollTop = logContainer.scrollHeight;
    } catch (error) {
        console.error('获取日志失败:', error);
    }
}

function startPolling() {
    fetchLogs();
    setInterval(fetchLogs, 500); // 每0.5秒刷新一次
}

window.onload = startPolling;

// 新增保存备注功能
function saveRemark(kcrwdm) {
    const courseEntry = document.querySelector(`input[name="kcrwdm"][value="${kcrwdm}"]`).parentElement;
    const remarkInput = courseEntry.querySelector('input[name="remark"]');
    const remark = remarkInput.value;

    fetch('/update_remark', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'kcrwdm': kcrwdm,
                'remark': remark
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showDialog('错误', data.error);
            } else {
                showDialog('信息', '备注已保存');
                log_message(`备注已保存，课程ID: ${kcrwdm}, 备注: ${remark}`);
            }
        })
        .catch(error => {
            console.error('保存备注失败:', error);
            showDialog('错误', '保存备注失败，请查看控制台错误信息。');
        });
}
