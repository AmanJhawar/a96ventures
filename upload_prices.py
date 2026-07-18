import yfinance as yf
import pandas as pd
import json
import subprocess
import requests

symbols = ["HDFCBANK", "RELIANCE", "TCS", "INFY", "SBIN", "TARIL"]
project_id = "a96ventures-882ec"
token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()

for sym in symbols:
    print(f"Fetching {sym}...")
    data = yf.download(f"{sym}.NS", start="2023-01-01", progress=False)
    df = data
    
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    
    df = df.reset_index()
    df.columns = [c.lower() for c in df.columns]
    if "date" not in df.columns:
        df = df.rename(columns={"index": "date"})
        
    df = df.dropna(subset=["close"])
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    
    values = []
    for _, row in df.iterrows():
        values.append({
            "mapValue": {
                "fields": {
                    "date": {"stringValue": str(row["date"])},
                    "open": {"doubleValue": float(row["open"])},
                    "high": {"doubleValue": float(row["high"])},
                    "low": {"doubleValue": float(row["low"])},
                    "close": {"doubleValue": float(row["close"])},
                    "volume": {"doubleValue": float(row["volume"])}
                }
            }
        })
    
    payload = {
        "fields": {
            "history": {
                "arrayValue": {
                    "values": values[-400:]  # Cap at 400
                }
            }
        }
    }
    
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/raw_prices/{sym}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print(f"Uploading {sym}...")
    res = requests.patch(url, headers=headers, json=payload)
    if res.status_code == 200:
        print(f"Success for {sym}")
    else:
        print(f"Failed for {sym}: {res.text}")

print("Done.")
