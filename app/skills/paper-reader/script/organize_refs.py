import json
import re
import sys

def parse_bibtex(bibtex_file):
    entries = []
    with open(bibtex_file, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = r'@(\w+)\s*\{([^,]+),([^@]+)'
    matches = re.findall(pattern, content, re.DOTALL)

    for match in matches:
        entry_type, key, fields = match
        entry = {
            'type': entry_type.lower(),
            'key': key.strip(),
        }

        field_pattern = r'(\w+)\s*=\s*\{([^}]+)\}'
        field_matches = re.findall(field_pattern, fields)
        for field, value in field_matches:
            entry[field.lower()] = value.strip()

        entries.append(entry)

    return entries

def format_reference(entry, style='apa'):
    title = entry.get('title', 'Unknown Title')
    authors = entry.get('author', 'Unknown').replace('\n', ' ')
    year = entry.get('year', 'n.d.')
    venue = entry.get('journal') or entry.get('booktitle', '')

    if style == 'apa':
        return f"{authors} ({year}). {title}. {venue}."
    elif style == 'mla':
        return f"{authors}. \"{title}.\" {venue}, {year}."
    elif style == 'ieee':
        return f"{authors}, \"{title},\" {venue}, {year}."
    else:
        return f"{authors} - {title} - {year}"

def generate_bibliography(papers, output_file="bibliography.txt", style='apa'):
    with open(output_file, 'w', encoding='utf-8') as f:
        for i, paper in enumerate(papers, 1):
            ref = format_reference(paper, style)
            f.write(f"[{i}] {ref}\n\n")

    print(f"参考文献已生成: {output_file}")

if __name__ == "__main__":
    print("参考文献整理工具")
    print("使用方法: python organize_refs.py <bibtex文件> [输出文件] [格式]")
