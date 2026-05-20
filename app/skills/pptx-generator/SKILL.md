---
name: pptx-generator
description: 将 HTML 网页 PPT 转换为传统的 PowerPoint 格式（.pptx）。当用户需要下载可以用 PowerPoint、WPS 或 Google Slides 打开的 PPT 文件时使用。
trigger_keywords:
  - 下载pptx
  - 下载PPT
  - 转pptx
  - 转PPTX
  - 导出pptx
  - 导出PPT
  - 下载幻灯片
  - convert to pptx
  - export to powerpoint
---

# PPTX Generator

## 这个 Skill 做什么

将 HTML 网页 PPT 转换为传统的 PowerPoint 格式（.pptx），用户可以下载后在 PowerPoint、WPS 或 Google Slides 中打开和编辑。

## 工作流

### Step 1 · 定位 HTML PPT 文件

找到 workspace 中的 HTML PPT 文件（通常是 `index.html`）。

常见位置：
- `workspace/项目名/index.html`
- `workspace/项目名/ppt/index.html`

### Step 2 · 读取 HTML 内容

使用 Read 工具读取 HTML 文件，提取幻灯片内容。

### Step 3 · 使用 python-pptx 生成 PPTX

使用 Bash 工具执行 Python 脚本生成 PPTX：

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RgbColor
from pptx.enum.text import PP_ALIGN
import re

# 创建演示文稿（16:9 宽屏）
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

def add_slide(title="", content="", layout_type="title_and_content"):
    slide_layout = prs.slide_layouts[6]  # 空白布局
    slide = prs.slides.add_slide(slide_layout)

    # 添加标题
    if title:
        left = Inches(0.5)
        top = Inches(0.5)
        width = Inches(12.333)
        height = Inches(1)
        title_box = slide.shapes.add_textbox(left, top, width, height)
        tf = title_box.text_frame
        tf.text = title
        p = tf.paragraphs[0]
        p.font.size = Pt(36)
        p.font.bold = True
        p.alignment = PP_ALIGN.LEFT

    # 添加内容
    if content:
        left = Inches(0.5)
        top = Inches(1.8)
        width = Inches(12.333)
        height = Inches(5)
        content_box = slide.shapes.add_textbox(left, top, width, height)
        tf = content_box.text_frame
        tf.text = content
        p = tf.paragraphs[0]
        p.font.size = Pt(18)
        p.line_spacing = 1.5

    return slide

# 从 HTML 中提取内容并添加幻灯片
# ... 解析逻辑 ...

# 保存文件
output_path = "workspace/项目名/输出文件名.pptx"
prs.save(output_path)
print(f"PPTX 已生成: {output_path}")
```

### Step 4 · 告知用户下载

告诉用户 PPTX 文件已生成，可以在 Workspace 页面下载。

## 解析 HTML 的要点

1. **提取每页 `<section class="slide">`**：每页对应一张幻灯片
2. **获取标题**：查找 `h1`, `h2`, `.h-hero`, `.h-xl` 等类
3. **获取正文**：查找 `.body-zh`, `.lead`, `.step-desc` 等类
4. **处理图片**：如果需要，可以提取图片路径但图片需要单独处理
5. **主题颜色**：从 `:root` 的 CSS 变量中提取主题色

## 示例转换

输入 HTML：
```html
<section class="slide dark">
  <h1 class="h-hero">演示标题</h1>
  <p class="lead">这是演示内容</p>
</section>
```

输出 PPTX：
- 第1页：标题"演示标题"，内容"这是演示内容"
