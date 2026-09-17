from pathlib import Path
import csv, hashlib, secrets
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / 'private'; PRIVATE.mkdir(parents=True, exist_ok=True)
INV = PRIVATE / 'inventory.csv'
if INV.exists():
    raise SystemExit('inventory.csv 已存在，已拒绝覆盖。补货请先备份并使用新的批次工具。')
SKUS = [('starter20',20,20,'PL20'),('pro100',100,10,'PL100')]
rows, sql_values = [], []
now = datetime.now(timezone.utc).isoformat()
for sku, quota, count, prefix in SKUS:
    for _ in range(count):
        raw = secrets.token_hex(6).upper()
        code = f'{prefix}-{raw[:4]}-{raw[4:8]}-{raw[8:12]}'
        h = hashlib.sha256(code.upper().encode()).hexdigest()
        rows.append([sku,code,quota,'available',now,'',''])
        sql_values.append(f"('{h}','{sku}',{quota},'xianyu inventory {sku}',true)")
with INV.open('w', newline='', encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['sku','code','quota','status','created_at','sold_at','order_ref']); w.writerows(rows)
sql = 'insert into public.promptlab_access_codes(code_hash,plan,quota_total,note,active) values\n' + ',\n'.join(sql_values) + '\non conflict (code_hash) do nothing;\n'
(PRIVATE/'inventory_insert.sql').write_text(sql, encoding='utf-8')
print(f'generated={len(rows)} starter20=20 pro100=10')