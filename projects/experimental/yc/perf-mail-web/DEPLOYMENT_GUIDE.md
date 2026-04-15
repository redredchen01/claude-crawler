# 绩效核对邮件网页版系统 - 部署指南

本指南将协助您在 **Linux / Mac** 或 **Windows** 环境下快速部署并启动“绩效核对邮件系统”。

---

## 🏗️ 第一步：环境准备与目录创建

请根据您的操作系统，在终端（Terminal 或 PowerShell）中执行以下命令：

### **Linux / Mac**
```bash
mkdir -p ~/perf-mail-web/templates ~/perf-mail-web/uploads
cd ~/perf-mail-web
```

### **Windows (PowerShell)**
```powershell
mkdir $HOME\perf-mail-web
mkdir $HOME\perf-mail-web\templates
mkdir $HOME\perf-mail-web\uploads
cd $HOME\perf-mail-web
```

---

## 🐍 第二步：安装 Python 虚拟环境与依赖

建议在虚拟环境中运行项目，以保持系统环境整洁。

### **Linux / Mac**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install flask openpyxl
```

### **Windows (PowerShell)**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install flask openpyxl
```

---

## 📄 第三步：准备项目文件

请确保您的项目目录结构如下所示：

```text
perf-mail-web/
├── app.py           # 核心逻辑
├── requirements.txt # 依赖列表
├── templates/
│   └── index.html   # 前端界面
└── uploads/         # 临时文件存放地
```

> [!TIP]
> 如果您还没有 `requirements.txt`，可以手动创建一个，内容如下：
> ```text
> flask
> openpyxl
> ```

---

## 🚀 第四步：启动项目

执行以下命令启动 Flask 服务：

### **Linux / Mac**
```bash
cd ~/perf-mail-web
source .venv/bin/activate
python3 app.py
```

### **Windows (PowerShell)**
```powershell
cd $HOME\perf-mail-web
.venv\Scripts\Activate.ps1
python app.py
```

---

## 🌐 第五步：访问与使用

1. 打开浏览器，访问：`http://localhost:8787`。
2. **上传 Excel**：点击页面中心的上传区域，选择您的绩效表格。
3. **预览数据**：系统会自动解析并展示表格前 10 行数据供核对。
4. **群发邮件**：点击底部的“确认并群发邮件”按钮（当前为模拟演示模式）。

---

## 🌙 长期运行（仅限 Linux）

如果您希望在后台持续运行该系统，可以使用 `nohup`：

*   **启动后台运行**：
    ```bash
    nohup python3 app.py > app.log 2>&1 &
    ```
*   **查看运行状态**：
    ```bash
    ps -ef | grep app.py
    ```

---

## 🔄 更新与维护

当需要更新依赖包时，请执行：
```bash
# 激活环境后
pip install -r requirements.txt
```

> [!IMPORTANT]
> 默认端口为 **8787**。如果启动失败，请检查该端口是否被其他程序占用。
