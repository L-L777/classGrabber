import asyncio
import os
import random
import string
import webbrowser
from argparse import ArgumentParser, BooleanOptionalAction
from datetime import datetime
from typing import Any

import httpx
from flask import Flask, jsonify, redirect, render_template, request, url_for
from pydantic import BaseModel


class Course(BaseModel):
    kcrwdm: int
    kcmc: str
    teacher: str


class Config(BaseModel):
    class AccountConfig(BaseModel):
        cookie: str = ""

    account: AccountConfig = AccountConfig()
    delay: float = 0.5
    courses: list[Course] = []


app = Flask(__name__)
app.secret_key = "".join(
    random.choices(string.ascii_letters + string.digits, k=16)
)  # 随机生成 secret_key
config_path = "config.json"
logs_dir = "logs"
log_file_path = os.path.join(logs_dir, "latest.log")

# 初始化日志目录
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

# 全局变量用于抢课控制
grab_course_task = None


# 读取配置
def load_config() -> Config:
    if not os.path.exists(config_path):
        default = Config()
        save_config(default)
        return default

    with open(config_path, "r", encoding="utf-8") as f:
        json = f.read()
        return Config.model_validate_json(json)


# 保存配置
def save_config(config: Config) -> None:
    with open(config_path, "w", encoding="utf-8") as f:
        json = config.model_dump_json(indent=4)
        f.write(json)


startup_time = datetime.now()
config = load_config()

with open(log_file_path, "wt", encoding="utf8") as f:
    pass


# 写入日志
def log_message(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}"

    with open(log_file_path, "a", encoding="utf-8") as log_file:
        log_file.write(log_entry + "\n")

    filename = startup_time.strftime("%Y-%m-%d %H-%M-%S")
    with open(os.path.join(logs_dir, f"{filename}.log"), "a", encoding="utf-8") as new_log_file:
        new_log_file.write(log_entry + "\n")


# 异步获取课程列表
async def fetch_courses(cookie: str) -> Any:
    url = "https://jxfw.gdut.edu.cn/xsxklist!getDataList.action"
    headers = {
        "x-requested-with": "XMLHttpRequest",
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://jxfw.gdut.edu.cn",
        "DNT": "1",
        "Connection": "keep-alive",
        "Referer": "https://jxfw.gdut.edu.cn/xsxklist!xsmhxsxk.action",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }
    body = {"sort": "kcrwdm", "order": "asc"}
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, params=body)
        response.raise_for_status()
        return response.json()


# 添加课程
@app.route("/add_course", methods=["POST"])
def add_course() -> Any:
    kcrwdm = request.form.get("kcrwdm")
    kcmc = request.form.get("kcmc")
    teacher = request.form.get("teacher", "未知")  # 默认值为'未知'

    # 校验数据
    if not kcrwdm or not kcmc:
        return jsonify({"error": "课程ID和课程名称不能为空"}), 400

    try:
        kcrwdm = int(kcrwdm)
    except ValueError:
        return jsonify({"error": "无效课程 ID"}), 400

    # 更新配置
    course_exists = any(course.kcrwdm == kcrwdm for course in config.courses)
    if course_exists:
        return jsonify({"error": "课程已经存在"}), 400

    # 添加课程到配置
    course = Course(kcrwdm=kcrwdm, kcmc=kcmc, teacher=teacher)
    config.courses.append(course)
    save_config(config)
    log_message(f"添加课程成功，课程ID: {kcrwdm}, 名称: {kcmc}, 老师: {teacher}")
    return jsonify({"success": True, "kcrwdm": kcrwdm, "kcmc": kcmc, "teacher": teacher})


# 抢课功能
async def grab_course(course: Course, cookie: str) -> bool:
    url = "https://jxfw.gdut.edu.cn/xsxklist!getAdd.action"
    headers = {
        "Host": "jxfw.gdut.edu.cn",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://jxfw.gdut.edu.cn",
        "DNT": "1",
        "Connection": "keep-alive",
        "Referer": "https://jxfw.gdut.edu.cn/xskjcjxx!kjcjList.action",
        "Cookie": cookie,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }

    data = {"kcrwdm": str(course.kcrwdm), "kcmc": course.kcmc}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, data=data)
        log_message(
            f"抢课请求发送，课程ID: {course.kcrwdm}, 名称: {course.kcmc}, 老师: {course.teacher}, 响应: {response.text}"
        )
        if "您已经选了该门课程" in response.text:
            return True
    except Exception as e:
        log_message(f"抢课失败: {e}")

    return False


# 运行抢课任务
async def start_grab_course_task(config: Config) -> None:
    finished = set[int]()
    for course in config.courses:
        if len(finished) == len(config.courses):
            await stop_grab_course()
            await asyncio.sleep(3)
            log_message("抢课完成！")

        if await grab_course(course, config.account.cookie):
            finished.add(course.kcrwdm)

        await asyncio.sleep(config.delay)


# 启动抢课线程
async def start_grab_course_background() -> None:
    global grab_course_task
    if not grab_course_task:
        grab_course_task = asyncio.create_task(start_grab_course_task(config))
    log_message("抢课已开始")


# 停止抢课
async def stop_grab_course() -> None:
    global grab_course_task
    if grab_course_task:
        grab_course_task.cancel()
    log_message("抢课已停止")


# 首页
@app.route("/")
def index() -> Any:
    logs = ""
    if os.path.exists(log_file_path):
        with open(log_file_path, "r", encoding="utf-8") as log_file:
            logs = log_file.readlines()[-100:]  # 读取最后100行
    return render_template("index.html", config=config, logs="".join(logs))


# 更新配置
@app.route("/update_config", methods=["POST"])
def update_config():
    cookie = request.form.get("cookie") or ""
    delay = float(request.form.get("delay", 0.5))

    try:
        courses = [
            Course(kcrwdm=int(kcrwdm), kcmc=kcmc, teacher=teacher)
            for kcrwdm, kcmc, teacher in zip(
                request.form.getlist("kcrwdm"),
                request.form.getlist("kcmc"),
                request.form.getlist("teacher"),
            )
        ]
    except ValueError:
        return {"error": "参数解析失败"}, 400

    config.account.cookie = cookie
    config.delay = delay
    config.courses = courses

    save_config(config)
    log_message("配置已更新")
    return redirect(url_for("index"))


# 获取课程列表
@app.route("/fetch_courses", methods=["POST"])
async def fetch_courses_endpoint():
    cookie = request.form.get("cookie")

    if not cookie:
        return jsonify({"error": "Cookie 不能为空"}), 400

    # 保存 cookie 到配置文件
    config.account.cookie = cookie
    save_config(config)
    log_message(f"Cookie 已保存: {cookie}")

    try:
        courses_data = await fetch_courses(cookie)
        available_courses = courses_data.get("rows", [])
        return jsonify({"available_courses": available_courses}), 200
    except Exception as e:
        log_message(f"获取课程列表失败: {e}")
        return jsonify({"error": f"获取课程列表失败: {e}"}), 500


# 启动抢课
@app.route("/start", methods=["POST"])
async def start_grab_course_route():
    await start_grab_course_background()
    return jsonify({"message": "抢课已开始"}), 200


# 停止抢课
@app.route("/stop", methods=["POST"])
async def stop_grab_course_route():
    await stop_grab_course()
    return jsonify({"message": "抢课已停止"}), 200


@app.route("/latest_log", methods=["GET"])
def latest_log():
    if not os.path.exists(log_file_path):
        return jsonify({"logs": ""})

    with open(log_file_path, "r", encoding="utf-8") as log_file:
        logs = log_file.readlines()[-100:]  # 读取最后100行

    return jsonify({"logs": "".join(logs)})


def open_browser():
    webbrowser.open_new("http://127.0.0.1:5000")


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--debug", default=False, action=BooleanOptionalAction)
    args = parser.parse_args()

    if not args.debug or not os.getenv("WERKZEUG_RUN_MAIN"):
        open_browser()

    app.run(debug=args.debug)


if __name__ == "__main__":
    main()
