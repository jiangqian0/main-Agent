import json
import sys
from datetime import datetime

def format_paper_notes(paper_data, output_file="paper_notes.md"):
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# 论文笔记\n\n")
        f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")

        f.write("## 论文信息\n")
        f.write(f"- **标题**: {paper_data.get('title', 'N/A')}\n")
        f.write(f"- **作者**: {paper_data.get('authors', 'N/A')}\n")
        f.write(f"- **年份**: {paper_data.get('year', 'N/A')}\n")
        f.write(f"- **来源**: {paper_data.get('venue', 'N/A')}\n")
        f.write(f"- **引用次数**: {paper_data.get('citations', 'N/A')}\n\n")

        f.write("## 研究问题\n")
        f.write(f"{paper_data.get('problem', 'N/A')}\n\n")

        f.write("## 核心贡献\n")
        for i, contrib in enumerate(paper_data.get('contributions', []), 1):
            f.write(f"{i}. {contrib}\n")
        f.write("\n")

        f.write("## 方法概述\n")
        f.write(f"{paper_data.get('method', 'N/A')}\n\n")

        f.write("## 实验结果\n")
        f.write(f"{paper_data.get('results', 'N/A')}\n\n")

        f.write("## 局限性\n")
        for limitation in paper_data.get('limitations', []):
            f.write(f"- {limitation}\n")
        f.write("\n")

        f.write("## 改进方向\n")
        for improvement in paper_data.get('improvements', []):
            f.write(f"- {improvement}\n")
        f.write("\n")

        f.write("---\n")
        f.write(f"*个人笔记: {paper_data.get('personal_notes', '')}*\n")

    print(f"论文笔记已生成: {output_file}")

if __name__ == "__main__":
    sample = {
        "title": "论文标题",
        "authors": "作者列表",
        "year": "2024",
        "venue": "会议/期刊",
        "citations": 0,
        "problem": "研究问题描述",
        "contributions": ["贡献1", "贡献2"],
        "method": "方法描述",
        "results": "实验结果",
        "limitations": ["局限性1"],
        "improvements": ["改进方向1"],
        "personal_notes": "个人思考"
    }
    format_paper_notes(sample)
