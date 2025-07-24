from flask import Flask, jsonify, request, render_template, url_for
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.errors import InvalidId
from datetime import datetime, timedelta # Import timedelta satu kali saja
import pytz
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Inisialisasi CORS untuk aplikasi Anda

# ***PERBAIKAN: Menggunakan zona waktu WITA (Asia/Makassar) untuk Kuta Selatan, Bali***
LOCAL_TIMEZONE = pytz.timezone('Asia/Makassar')

# MongoDB connection
client = MongoClient('mongodb+srv://rachelriyanto2:43Bu7RSm24uE4XbZ@cluster0.mu3dzxz.mongodb.net/')
db = client.cafe_db
menu_collection = db.menu
member_collection = db.member
transaksi_collection = db.transaksi
counters_collection = db.counters # Koleksi untuk menyimpan counter sequence

# Helper function to convert MongoDB documents to JSON-compatible format
def convert_to_json_serializable(data):
    if isinstance(data, list):
        return [convert_to_json_serializable(item) for item in data]
    elif isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, ObjectId):
                data[key] = str(value)
            elif isinstance(value, datetime):
                data[key] = value.isoformat() # ISO format untuk tanggal
            else:
                data[key] = convert_to_json_serializable(value) # Rekursif untuk nested dictionaries/lists
        return data
    else:
        return data

# Fungsi untuk mendapatkan nilai sequence berikutnya DAN menginkremennya
def get_next_sequence_value(sequence_name):
    counter = counters_collection.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=True
    )
    return counter["sequence_value"]

# Fungsi untuk mendapatkan ID member berikutnya yang unik dari ID tertinggi yang ada di koleksi member
def get_unique_next_member_id_value():
    current_highest_id_num = 0
    existing_member_ids = [m['id'] for m in member_collection.find({}, {"id": 1})]
    
    for member_id_str in existing_member_ids:
        if member_id_str and member_id_str.startswith('M') and member_id_str[1:].isdigit():
            try:
                num_part = int(member_id_str[1:])
                if num_part > current_highest_id_num:
                    current_highest_id_num = num_part
            except ValueError:
                pass

    next_id_num = current_highest_id_num + 1

    counters_collection.update_one(
        {"_id": "memberId"},
        {"$max": {"sequence_value": next_id_num - 1}}, # Simpan nilai tertinggi yang sudah dipakai
        upsert=True # Buat counter jika belum ada
    )
    return next_id_num


# --- ROUTE UNTUK MENYAJIKAN HALAMAN HTML (FRONTEND) ---
@app.route("/")
def index():
    return render_template("index.html")

# --- API ENDPOINTS BACKEND ANDA ---

# Endpoint untuk menampilkan menu
@app.route("/menu", methods=["GET"])
def get_menu():
    menu_items = list(menu_collection.find())
    menu_items_serializable = convert_to_json_serializable(menu_items)
    return jsonify({"menu": menu_items_serializable})

# Endpoint untuk menambah menu
@app.route("/menu", methods=["POST"])
def add_menu():
    data = request.get_json() if request.is_json else request.form
    if not data:
        return jsonify({"error": "Data request tidak valid"}), 400

    nama_makanan = data.get("namaMakanan")
    harga_makanan = data.get("hargaMakanan")

    if not nama_makanan or harga_makanan is None:
        return jsonify({"error": "Nama makanan dan harga harus diisi"}), 400

    try:
        harga_makanan = float(harga_makanan)
        if harga_makanan < 0:
            return jsonify({"error": "Harga makanan tidak boleh negatif"}), 400
    except ValueError:
        return jsonify({"error": "Harga harus berupa angka"}), 400
    
    id_menu = get_next_sequence_value("menuId")
    new_item = {"menuId": id_menu,"namaMakanan": nama_makanan, "hargaMakanan": harga_makanan}
    result = menu_collection.insert_one(new_item)
    
    new_item_serializable = convert_to_json_serializable(new_item)
    return jsonify({"message": "Menu berhasil ditambahkan", "menu": new_item_serializable}), 201

# Endpoint untuk update menu
@app.route("/menu", methods=["PUT"])
def update_menu():
    data = request.get_json() 

    if not data:
        return jsonify({"error": "Data request tidak valid."}), 400

    id_menu = data.get("menuId")
    nama_makanan = data.get("namaMakanan")
    harga_makanan = data.get("hargaMakanan") # ***PERBAIKAN: Gunakan nama variabel yang benar***

    if id_menu is None or not nama_makanan or harga_makanan is None:
        return jsonify({"error": "MenuId, Nama makanan, dan Harga makanan harus diisi."}), 400

    try:
        harga_makanan = float(harga_makanan)
        if harga_makanan < 0:
            return jsonify({"error": "Harga makanan tidak boleh negatif."}), 400
    except ValueError:
        return jsonify({"error": "Harga harus berupa angka."}), 400

    update_fields = {
        "namaMakanan": nama_makanan,
        "hargaMakanan": harga_makanan # ***PERBAIKAN: Gunakan nama variabel yang benar***
    }

    result = menu_collection.update_one(
        {"menuId": id_menu},
        {"$set": update_fields}
    )

    if result.matched_count == 0:
        return jsonify({"error": "Menu tidak ditemukan."}), 404
    elif result.modified_count > 0:
        updated_menu = menu_collection.find_one({"menuId": id_menu})
        if updated_menu:
            updated_menu_serializable = convert_to_json_serializable(updated_menu)
            return jsonify({"message": "Menu berhasil diupdate.", "menu": updated_menu_serializable}), 200
        else:
            return jsonify({"message": "Menu berhasil diupdate, namun gagal mengambil data terbaru."}), 200
    else:
        return jsonify({"message": "Menu ditemukan, tetapi tidak ada perubahan yang terdeteksi."}), 200


# Endpoint untuk menghapus menu
@app.route("/menu", methods=["DELETE"])
def delete_menu():
    data = request.get_json() if request.is_json else request.form
    menu_id = data.get("menuId")

    if not menu_id:
        return jsonify({"error": "MenuId harus diisi"}), 400

    # Convert to string for comparison if needed
    menu_id = str(menu_id).strip()

    try:
        # Try both string and number conversion if needed
        result = menu_collection.delete_one({"menuId": menu_id})
        if result.deleted_count == 0:
            # Try with integer if menuId is stored as number
            if menu_id.isdigit():
                result = menu_collection.delete_one({"menuId": int(menu_id)})

        if result.deleted_count > 0:
            return jsonify({"message": "Menu berhasil dihapus"}), 200
        else:
            return jsonify({"error": "Menu tidak ditemukan"}), 404
    except Exception as e:
        return jsonify({"error": f"Terjadi kesalahan saat menghapus menu: {str(e)}"}), 500


# Endpoint untuk menampilkan member
@app.route("/members", methods=["GET"])
def get_members():
    members = list(member_collection.find())
    members_serializable = convert_to_json_serializable(members)
    return jsonify({"members": members_serializable})

# Endpoint untuk mendapatkan ID Member berikutnya sebagai placeholder
@app.route("/members/next_id", methods=["GET"])
def get_next_member_id_placeholder():
    next_raw_id = get_unique_next_member_id_value()
    formatted_id = f"M{next_raw_id:03d}"
    return jsonify({"nextId": formatted_id})


# Endpoint untuk menambah member
@app.route("/members", methods=["POST"])
def add_member():
    data = request.get_json() if request.is_json else request.form
    name = data.get("name")
    member_id = data.get("id")

    if not name or not member_id:
        return jsonify({"error": "Nama dan ID harus diisi"}), 400

    if member_collection.find_one({"id": member_id}):
        return jsonify({"error": "ID sudah digunakan"}), 409

    new_member = {"name": name, "id": member_id}
    result = member_collection.insert_one(new_member)
    
    if member_id.startswith('M') and member_id[1:].isdigit():
        try:
            member_id_num = int(member_id[1:])
            counters_collection.update_one(
                {"_id": "memberId"},
                {"$max": {"sequence_value": member_id_num}},
                upsert=True
            )
        except ValueError:
            pass

    new_member_serializable = convert_to_json_serializable(new_member)
    return jsonify({"message": "Member berhasil ditambahkan", "member": new_member_serializable}), 201


# Endpoint untuk proses pembelian (kasir)
@app.route("/order", methods=["POST"])
def process_order():
    data = request.get_json() if request.is_json else request.form
    member_id_input = data.get("id_member")
    menu_id_input = data.get("menuId")
    quantity = data.get("jumlah")

    if not all([menu_id_input, quantity]):
        return jsonify({"error": "menuId dan jumlah harus diisi"}), 400

    try:
        menu_id_processed = int(menu_id_input)
        quantity = int(quantity)
        if quantity <= 0:
            return jsonify({"error": "Jumlah harus angka positif"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Menu ID dan jumlah harus angka"}), 400

    selected_item = menu_collection.find_one({"menuId": menu_id_processed})
    if not selected_item:
        return jsonify({"error": "Menu tidak ditemukan"}), 404

    harga_item = float(selected_item['hargaMakanan'])
    total_price = harga_item * quantity

    member_exists = False
    discount = 0
    if member_id_input:
        if member_collection.find_one({"id": member_id_input}):
            member_exists = True
            discount = total_price * 0.05

    final_price = total_price - discount
    local_time = datetime.now(LOCAL_TIMEZONE)
    transaksi_id = get_next_sequence_value("transaksiId")

    new_order = {
        "transaksiId": transaksi_id,
        "member_id": member_id_input if member_exists else None,
        "menu_item": selected_item['namaMakanan'],
        "menu_mongo_id": str(selected_item['_id']),
        "menuId": selected_item['menuId'],
        "quantity": quantity,
        "harga_satuan": harga_item,
        "harga_asli": total_price,
        "diskon": discount,
        "harga_final": final_price,
        "is_member": member_exists,
        "timestamp": local_time,
        "timezone": str(LOCAL_TIMEZONE),
        "timestamp_iso": local_time.isoformat()
    }

    transaksi_result = transaksi_collection.insert_one(new_order)

    response_data = {
        "status": "success",
        "message": "Pembelian berhasil",
        "transaksi_id": new_order["transaksiId"],
        "order_mongo_id": str(transaksi_result.inserted_id),
        "menu": selected_item['namaMakanan'],
        "menuId": selected_item['menuId'],
        "quantity": quantity,
        "harga_satuan": harga_item,
        "total_asli": total_price,
        "diskon": discount,
        "total_bayar": final_price,
        "is_member": member_exists
    }

    return jsonify(response_data), 201


# Endpoint untuk melihat transaksi
@app.route("/transactions", methods=["GET"])
def get_transactions():
    transactions = list(transaksi_collection.find().sort("timestamp", -1))
    transactions_serializable = convert_to_json_serializable(transactions)
    return jsonify({"transactions": transactions_serializable})

# Endpoint untuk mendapatkan data transaksi harian untuk diagram
# ***PERBAIKAN: Hapus duplikasi endpoint ini***
@app.route("/transactions/daily_summary", methods=["GET"])
def get_daily_transaction_summary():
    # Menggunakan zona waktu lokal untuk hari ini
    today = datetime.now(LOCAL_TIMEZONE).replace(hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        # Filter transaksi dari hari ini saja
        {"$match": {"timestamp": {"$gte": today}}},
        # Group berdasarkan tanggal (hanya ada satu tanggal karena sudah difilter)
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
            "totalTransactions": {"$sum": 1},
            "totalRevenue": {"$sum": "$harga_final"}
        }},
        {"$sort": {"_id": 1}} # Urutkan berdasarkan tanggal
    ]
    
    summary = list(transaksi_collection.aggregate(pipeline))

    if not summary:
        # Jika tidak ada transaksi hari ini, kembalikan data nol
        return jsonify({"date": today.strftime("%Y-%m-%d"), "totalTransactions": 0, "totalRevenue": 0})
    
    # Karena kita hanya filter hari ini, hasilnya harusnya 1 dokumen
    daily_data = summary[0]
    return jsonify({
        "date": daily_data["_id"],
        "totalTransactions": daily_data["totalTransactions"],
        "totalRevenue": daily_data["totalRevenue"]
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)