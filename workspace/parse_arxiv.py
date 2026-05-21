import re
import json
from bs4 import BeautifulSoup

# 读取 arXiv 搜索结果 HTML
with open('arxiv_soc_search.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# 查找所有论文条目
papers = []

# arXiv 论文通常在 .arxiv-result 中
results = soup.find_all('div', class_='arxiv-result')

print(f"找到 {len(results)} 个结果")

for i, result in enumerate(results[:10]):  # 只处理前10个
    try:
        # 提取标题
        title_elem = result.find('p', class_='title')
        title = title_elem.get_text(strip=True) if title_elem else "N/A"
        
        # 提取作者
        authors_elem = result.find('div', class_='authors')
        authors = authors_elem.get_text(strip=True) if authors_elem else "N/A"
        
        # 提取摘要
        abstract_elem = result.find('span', class_='abstract-full')
        abstract = abstract_elem.get_text(strip=True) if abstract_elem else "N/A"
        
        # 提取 arXiv ID 和链接
        id_elem = result.find('a', href=re.compile(r'/abs/\d'))
        arxiv_id = id_elem.get_text(strip=True) if id_elem else "N/A"
        link = f"https://arxiv.org{id_elem['href']}" if id_elem else "N/A"
        
        # 提取发表日期
        date_elem = result.find('div', class_='is-size-7')
        date = date_elem.get_text(strip=True) if date_elem else "N/A"
        
        papers.append({
            'title': title,
            'authors': authors,
            'abstract': abstract,
            'arxiv_id': arxiv_id,
            'link': link,
            'date': date
        })
        
        print(f"\n{i+1}. {title}")
        print(f"   Authors: {authors}")
        print(f"   Link: {link}")
        
    except Exception as e:
        print(f"Error processing result {i}: {e}")

# 保存结果
with open('soc_papers.json', 'w', encoding='utf-8') as f:
    json.dump(papers, f, indent=2, ensure_ascii=False)

print(f"\n\n共提取 {len(papers)} 篇论文")
