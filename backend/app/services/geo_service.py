import requests
from typing import List, Dict

class GEOService:
    def __init__(self):
        self.base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

    def fetch_recent_datasets(self, retmax: int = 10) -> List[Dict[str, str]]:
        """
        调用 NCBI E-utilities 获取最新公开的 GEO Series (GSE) 数据集
        """
        print(f"🌐 [GEO Service] Fetching {retmax} recent datasets from GEO...")
        
        # 1. 搜索最新的 GSE 记录 ID
        search_url = f"{self.base_url}/esearch.fcgi"
        search_params = {
            "db": "gds",
            "term": "GSE[ETYP]", # 只搜索 Series (GSE)
            "retmax": retmax,
            "retmode": "json",
            "sort": "PDAT" # 按发布日期 (Publication Date) 降序排列
        }
        
        try:
            search_res = requests.get(search_url, params=search_params, timeout=15)
            search_res.raise_for_status()
            id_list = search_res.json().get("esearchresult", {}).get("idlist", [])
            
            if not id_list:
                return []

            # 2. 根据 ID 批量获取摘要详情
            summary_url = f"{self.base_url}/esummary.fcgi"
            summary_params = {
                "db": "gds",
                "id": ",".join(id_list),
                "retmode": "json"
            }
            
            summary_res = requests.get(summary_url, params=summary_params, timeout=15)
            summary_res.raise_for_status()
            summary_data = summary_res.json().get("result", {})
            
            datasets = []
            for uid in id_list:
                doc = summary_data.get(uid, {})
                if not doc: continue
                    
                accession = doc.get("accession", "")
                title = doc.get("title", "")
                summary = doc.get("summary", "")
                
                # 过滤掉无效数据
                if accession and title and summary:
                    datasets.append({
                        "accession": accession,
                        "title": title,
                        "summary": summary,
                        "url": f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={accession}"
                    })
            
            print(f"✅ [GEO Service] Fetched {len(datasets)} valid datasets.")
            return datasets
            
        except Exception as e:
            print(f"❌ [GEO Service] Fetch error: {e}")
            return []

geo_service = GEOService()