"""Self-contained desktop window for the Gear Design Assistant."""
from __future__ import annotations

import logging
import os
import sys
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer

from cad_backend.gear_step import Handler

_DLL_SEARCH_HANDLES = []


def main() -> int:
    user_data = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "GearDesign"
    user_data.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=user_data / "launcher.log", level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    if getattr(sys, "frozen", False):
        bundle_root = Path(sys._MEIPASS)
        for dll_dir in (bundle_root, bundle_root / "PySide6", bundle_root / "shiboken6"):
            if dll_dir.is_dir():
                _DLL_SEARCH_HANDLES.append(os.add_dll_directory(str(dll_dir)))
                os.environ["PATH"] = str(dll_dir) + os.pathsep + os.environ.get("PATH", "")

    try:
        from PySide6.QtCore import QUrl
        from PySide6.QtWidgets import QApplication, QFileDialog, QMainWindow, QMessageBox
        from PySide6.QtWebEngineCore import QWebEngineDownloadRequest
        from PySide6.QtWebEngineWidgets import QWebEngineView
        app = QApplication(sys.argv)
    except BaseException:
        logging.exception("Could not initialize the embedded Qt desktop UI")
        raise
    app.setApplicationName("齿轮设计助手")
    app.setOrganizationName("GearDesign")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.daemon_threads = True
    except OSError as exc:
        logging.exception("Could not start local service")
        QMessageBox.critical(None, "启动失败", f"本地服务启动失败：\n{exc}")
        return 1

    logging.info("Embedded interface service listening on 127.0.0.1:%s", server.server_port)
    threading.Thread(target=server.serve_forever, name="GearDesignHTTP", daemon=True).start()
    window = QMainWindow()
    window.setWindowTitle("齿轮设计助手")
    window.resize(1440, 960)
    window.setMinimumSize(1050, 720)
    file_menu = window.menuBar().addMenu("文件")
    exit_action = file_menu.addAction("退出")
    exit_action.triggered.connect(window.close)
    view = QWebEngineView(window)
    last_save_directory = [Path(sys.executable).resolve().parent
                           if getattr(sys, "frozen", False)
                           else Path.home() / "Documents"]

    def save_download(item: QWebEngineDownloadRequest) -> None:
        suggested_name = Path(item.downloadFileName()).name or "gear_export"
        suffix = Path(suggested_name).suffix.lower()
        if suffix in {".step", ".stp"}:
            title, file_filter = "保存 STEP 模型", "STEP 模型 (*.step *.stp)"
            default_suffix = ".step"
        else:
            title, file_filter = "保存 SVG 轮廓", "SVG 轮廓 (*.svg)"
            default_suffix = ".svg"
        path, _ = QFileDialog.getSaveFileName(
            window, title, str(last_save_directory[0] / suggested_name), file_filter
        )
        if not path:
            item.cancel()
            return
        target = Path(path)
        if not target.suffix:
            target = target.with_suffix(default_suffix)
        last_save_directory[0] = target.parent

        def state_changed(state) -> None:
            if state == QWebEngineDownloadRequest.DownloadState.DownloadCompleted:
                QMessageBox.information(window, "保存成功", f"文件已保存到：\n{target}")
            elif state == QWebEngineDownloadRequest.DownloadState.DownloadInterrupted:
                QMessageBox.critical(window, "保存失败", item.interruptReasonString())

        item.stateChanged.connect(state_changed)
        item.setDownloadDirectory(str(target.parent))
        item.setDownloadFileName(target.name)
        item.accept()

    view.page().profile().downloadRequested.connect(save_download)
    window.setCentralWidget(view)
    view.load(QUrl(f"http://127.0.0.1:{server.server_port}/"))

    def close_event(event) -> None:
        server.shutdown()
        server.server_close()
        event.accept()

    window.closeEvent = close_event
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
