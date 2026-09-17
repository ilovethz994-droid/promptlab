from pathlib import Path
import csv
from datetime import datetime
import tkinter as tk
from tkinter import messagebox

ROOT = Path(__file__).resolve().parent
INV = ROOT / 'private' / 'inventory.csv'
URL = 'https://promptlab-eta.vercel.app'

SKU_LABELS = {
    'starter20': '20次版',
    'pro100': '100次版',
}

def load_rows():
    with INV.open('r', encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def save_rows(rows):
    tmp = INV.with_suffix('.tmp')
    fields = ['sku','code','quota','status','created_at','sold_at','order_ref']
    with tmp.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(rows)
    tmp.replace(INV)

def available_count(rows, sku):
    return sum(1 for r in rows if r['sku']==sku and r['status']=='available')

def refresh_counts():
    rows = load_rows()
    count_var.set(
        f"20次版剩余 {available_count(rows,'starter20')} 枚 ｜ "
        f"100次版剩余 {available_count(rows,'pro100')} 枚"
    )

def deliver(sku):
    order = order_var.get().strip()
    rows = load_rows()
    item = next((r for r in rows if r['sku']==sku and r['status']=='available'), None)
    if not item:
        messagebox.showwarning('库存不足', f'{SKU_LABELS[sku]} 已无可用访问码。')
        return
    if not order:
        if not messagebox.askyesno('未填写订单备注','没有填写订单号/买家备注，仍然发货吗？'):
            return
    item['status'] = 'sold'
    item['sold_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
    item['order_ref'] = order
    save_rows(rows)
    msg = (
        f"PromptLab 提示词精修器｜{SKU_LABELS[sku]}\n"
        f"使用网址：{URL}\n"
        f"访问码：{item['code']}\n\n"
        "使用方法：打开网址 → 输入访问码 → 粘贴你的原始需求 → 点击『一键精修』 → 复制结果。\n"
        "访问码会自动保存在当前浏览器，请自行妥善保管。"
    )
    output.delete('1.0', tk.END); output.insert('1.0', msg)
    root.clipboard_clear(); root.clipboard_append(msg); root.update()
    refresh_counts()
    messagebox.showinfo('已生成发货内容','访问码已标记为已售，完整交付话术已复制到剪贴板。')

root = tk.Tk()
root.title('PromptLab 卖家发货工具')
root.geometry('700x520')
root.minsize(620,460)

frame = tk.Frame(root, padx=24, pady=20); frame.pack(fill='both', expand=True)
tk.Label(frame, text='PromptLab 卖家发货工具', font=('Microsoft YaHei UI',18,'bold')).pack(anchor='w')
tk.Label(frame, text='卖出一单后，选规格即可自动取未使用访问码并复制交付话术。', fg='#555').pack(anchor='w', pady=(4,16))
count_var = tk.StringVar(); tk.Label(frame, textvariable=count_var, font=('Microsoft YaHei UI',11,'bold')).pack(anchor='w', pady=(0,12))
order_var = tk.StringVar()
tk.Label(frame, text='订单号 / 买家备注（可选）').pack(anchor='w')
tk.Entry(frame, textvariable=order_var, font=('Consolas',11)).pack(fill='x', pady=(4,14))
btns = tk.Frame(frame); btns.pack(fill='x')
tk.Button(btns, text='发货｜20次版', command=lambda:deliver('starter20'), height=2, width=20).pack(side='left', padx=(0,12))
tk.Button(btns, text='发货｜100次版', command=lambda:deliver('pro100'), height=2, width=20).pack(side='left')
tk.Label(frame, text='交付内容').pack(anchor='w', pady=(18,4))
output = tk.Text(frame, height=12, wrap='word', font=('Microsoft YaHei UI',10)); output.pack(fill='both', expand=True)
refresh_counts()
root.mainloop()
