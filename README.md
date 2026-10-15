# 齿轮设计助手

面向《机械设计基础》课程的 Windows 桌面齿轮建模工具。支持参数化预览、齿轮运动演示，以及 SVG 轮廓和 STEP 三维模型导出。

> 当前项目主要用于课程学习和方案比较。导出的模型未经完整强度、精度、公差和制造校核，不应直接作为生产依据。

## 特性

- 直齿圆柱齿轮、斜齿圆柱齿轮及其齿轮副。
- 直齿齿条与小齿轮副。
- 单个直齿锥齿轮的课程近似模型。
- 实时交互式 3D 预览、参数变化更新和齿轮运动动画。
- 导出 SVG 轮廓及 STEP 三维实体；保存位置由用户选择。
- Windows 桌面窗口运行，渲染依赖随源码/便携包提供。

详细使用说明、已实现范围和设计限制见下文。

## 已完成

- 外啮合直齿圆柱齿轮：参数预览、SVG 轮廓和 STEP 实体。
- 外啮合斜齿圆柱齿轮：按法向模数、法向压力角和螺旋角构造横向齿形。
- 直齿/斜齿圆柱齿轮副：输入两轮齿数，按理论中心距与相反物理旋向定位，并生成 STEP 装配。
- 直齿齿条与小齿轮副：参数化三维预览及 STEP 装配。
- 单个直齿锥齿轮：渐开线截面线性缩锥的课程近似预览和 STEP 实体，不支持锥齿轮副。
- 交互式 3D 预览：鼠标左键拖动旋转、滚轮缩放、俯视切换；参数变化时即时重建模型。播放动画时齿轮副按齿数比反向联动，齿条副显示齿轮转动与齿条平移，并可调速度。渲染库随程序离线打包。
- 中键拖动已禁用，页面仅通过滚轮或滚动条滚动，避免误触发浏览器自动滚动。
- 内嵌桌面窗口；导出 SVG 或 STEP 时弹出系统“另存为”窗口，完成后显示文件完整路径。

## 使用便携版

1. 解压 `dist/GearDesign-Portable.zip` 到一个有写入权限的文件夹。
2. 双击 `GearDesign/GearDesign.exe`。
3. 在“齿轮类型”选择直齿、斜齿、齿条副或单轮锥齿轮。圆柱齿轮可选单轮或齿轮副；齿条自动切换为齿条副，锥齿轮当前仅支持单轮。
4. 左键拖动 3D 视图旋转模型，滚轮缩放；中键拖动不会移动页面。页面滚动请使用滚轮或拖动窗口滚动条；选择“俯视”切换正视观察。
5. 点击“播放运动”查看动态啮合，拖动速度滑条调节转速，再次点击暂停。
6. 点击“导出 SVG 轮廓”或“生成 STEP 模型”，在弹出的保存窗口里选定文件夹和文件名；成功后程序会提示完整保存路径。
7. 最终 STEP 和 SVG 文件写入你选定的位置；程序不会再自动在 C 盘的应用数据目录保存模型副本。STEP 几何生成时会短暂使用临时文件，生成后自动清理。
8. 用 SolidWorks、FreeCAD 等 CAD 软件打开 STEP 文件。

整个便携文件夹需要一起保留；不要只拷贝 `GearDesign.exe`。首次启动时 Windows 可能显示 SmartScreen，因为课程版程序未作代码签名。

## 从源码运行和重新打包

项目专用 Python 环境已配置时：

```powershell
.\.venv\Scripts\python.exe .\desktop_app.py
```

准备构建环境并生成免安装目录及 ZIP：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-build.txt
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\build_portable.ps1
```

输出为 `dist/GearDesign/GearDesign.exe` 和 `dist/GearDesign-Portable.zip`。便携包内包含 Python、CadQuery、OpenCascade、Qt WebEngine 和页面资源，体积较大是为了免除目标电脑上的运行环境配置。

## 依赖与许可

本项目采用 MIT License，详见 [LICENSE](LICENSE)。`web/vendor/` 中的 Three.js 代码使用其自身的 MIT 许可，版权及许可文本见 `web/vendor/THREE-LICENSE.txt`。运行和打包依赖由 `requirements.txt` 与 `requirements-build.txt` 声明；CadQuery、PySide6、PyInstaller 等依赖各自遵循其上游许可。

欢迎提交问题报告和改进建议。贡献前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 设计范围与限制

斜齿轮的名义中心距采用 `a = mn(z1+z2)/(2 cos β)`，齿顶/齿根高度按法向模数处理。轮齿边界以离散渐开线和近似齿根过渡构成，齿条齿形、锥齿轮锥化和装配相位用于课程设计预览；尚无 ISO/GB 精度等级、制造侧隙、公差、修形、轴承/箱体、强度寿命或完整齿面干涉校核。材料选项只作记录。导出的 STEP 是几何交换模型，不是 SolidWorks 原生特征树。

蜗杆蜗轮、成对锥齿轮的精确共轭齿面、标准强度校核、带公差的工程图 PDF/DXF 尚未实现；当前 SVG 是轮廓图，不应作为生产图纸。请把模型用于课程学习和方案比较，不要未经校核直接制造或装配。

