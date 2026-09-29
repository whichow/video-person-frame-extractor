# Video Person Frame Extractor

通用视频人物关键帧提取器。完全在浏览器本地处理视频，不上传服务器。

## 功能
- 本地视频文件或允许 CORS 的视频 URL
- TensorFlow.js COCO-SSD 检测 `person`
- 可调采样间隔、置信度、最小人物占比
- 基于人物区域 dHash 的相似画面去重
- 结合检测置信度、人物面积、清晰度选择更佳帧
- 保存原始分辨率 JPEG
- 导出 `people.json`、`contact-sheet.jpg`、完整 ZIP

## 使用
直接打开 GitHub Pages 页面，选择视频后点击“开始识别”。处理全部发生在当前浏览器。
网络 URL 受目标站点 CORS、鉴权和视频格式影响；不兼容时请先下载视频。

## 隐私
视频字节不会上传到本项目服务器。模型文件与前端依赖从 CDN 加载。

## 技术
TensorFlow.js + COCO-SSD + JSZip + Canvas API。当前版本只判断画面中是否出现人物，不做人脸识别和身份识别。

## License
项目代码 MIT。第三方依赖遵循各自许可证。
