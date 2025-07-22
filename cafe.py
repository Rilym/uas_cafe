from flask import Flask, jsonify, request
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime
import pytz

app = Flask(__name__)

LOCAL_TIMEZONE = pytz.timezone('Asia/Jakarta')

# MongoDB connection
client = MongoClient('mongodb+srv://rachelriyanto2:43Bu7RSm24uE4XbZ@cluster0.mu3dzxz.mongodb.net/')
db = client.cafe_db
menu_collection = db.menu
member_collection = db.member
transaksi_collection = db.transaksi


# Helper function to convert MongoDB documents to JSON-compatible format
def convert_to_json_serializable(data):
    if isinstance(data, list):
        return [convert_to_json_serializable(item) for item in data]
    elif isinstance(data, dict):
        return {key: str(value) if key == '_id' else convert_to_json_serializable(value) for key, value in data.items()}
    else:
        return data


@app.route("/")
def home():
    return "Welcome to DouxHwang Cafe API"


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
    nama_makanan = data.get("namaMakanan")
    harga_makanan = data.get("hargaMakanan")

    if not nama_makanan or not harga_makanan:
        return jsonify({"error": "Nama makanan dan harga harus diisi"}), 400

    try:
        harga_makanan = float(harga_makanan)
    except ValueError:
        return jsonify({"error": "Harga harus berupa angka"}), 400

    new_item = {"namaMakanan": nama_makanan, "hargaMakanan": harga_makanan}
    result = menu_collection.insert_one(new_item)
    return jsonify({"message": "Menu berhasil ditambahkan", "id": str(result.inserted_id)}), 201


# Endpoint untuk menghapus menu
@app.route("/menu/<string:menu_id>", methods=["DELETE"])
def delete_menu(menu_id):
    try:
        result = menu_collection.delete_one({"_id": ObjectId(menu_id)})
        if result.deleted_count > 0:
            return jsonify({"message": "Menu berhasil dihapus"}), 200
        else:
            return jsonify({"error": "Menu tidak ditemukan"}), 404
    except Exception as e:
        return jsonify({"error": "ID tidak valid"}), 400


# Endpoint untuk menampilkan member
@app.route("/members", methods=["GET"])
def get_members():
    members = list(member_collection.find())
    members_serializable = convert_to_json_serializable(members)
    return jsonify({"members": members_serializable})


# Endpoint untuk menambah member
@app.route("/members", methods=["POST"])
def add_member():
    data = request.get_json() if request.is_json else request.form
    name = data.get("name")
    member_id = data.get("id")

    if not name or not member_id:
        return jsonify({"error": "Nama dan ID harus diisi"}), 400

    if member_collection.find_one({"id": member_id}):
        return jsonify({"error": "ID sudah digunakan"}), 400

    new_member = {"name": name, "id": member_id}
    result = member_collection.insert_one(new_member)
    return jsonify({"message": "Member berhasil ditambahkan", "id": str(result.inserted_id)}), 201


# Endpoint untuk proses pembelian (kasir)
@app.route("/order", methods=["POST"])
def process_order():
    # Get and validate input
    data = request.get_json() if request.is_json else request.form
    member_id = data.get("id")
    menu_number = data.get("pesanan")
    quantity = data.get("jumlah")

    if not all([member_id, menu_number, quantity]):
        return jsonify({"error": "id, pesanan, dan jumlah harus diisi"}), 400

    # Convert to proper data types
    try:
        menu_number = int(menu_number)
        quantity = int(quantity)
    except (ValueError, TypeError):
        return jsonify({"error": "Pesanan dan jumlah harus angka"}), 400

    # Validate menu exists
    menu_items = list(menu_collection.find())
    if menu_number < 1 or menu_number > len(menu_items):
        return jsonify({"error": "Nomor menu tidak valid"}), 400

    # Calculate prices
    selected_item = menu_items[menu_number - 1]
    harga_item = float(selected_item['hargaMakanan'])
    total_price = harga_item * quantity

    # Check member status and calculate discount
    member_exists = member_collection.find_one({"id": member_id})
    discount = total_price * 0.05 if member_exists else 0
    final_price = total_price - discount

    local_time = datetime.now(LOCAL_TIMEZONE)

    # Create transaction record
    new_order = {
        "member_id": member_id,
        "menu_item": selected_item['namaMakanan'],
        "menu_id": str(selected_item['_id']),
        "quantity": quantity,
        "harga_satuan": harga_item,
        "harga_asli": total_price,
        "diskon": discount,
        "harga_final": final_price,
        "is_member": bool(member_exists),
        "timestamp": local_time,
        "timezone": str(LOCAL_TIMEZONE),
        "timestamp_iso": local_time.isoformat()
    }

    # Save to database
    transaksi_result = transaksi_collection.insert_one(new_order)

    # Prepare response
    response_data = {
        "status": "success",
        "message": "Pembelian berhasil",
        "order_id": str(transaksi_result.inserted_id),
        "menu": selected_item['namaMakanan'],
        "quantity": quantity,
        "harga_satuan": harga_item,
        "total_asli": total_price,
        "diskon": discount,
        "total_bayar": final_price,
        "member": bool(member_exists)
    }

    return jsonify(response_data)


# Endpoint untuk melihat transaksi
@app.route("/transactions", methods=["GET"])
def get_transactions():
    transactions = list(transaksi_collection.find().sort("timestamp", -1))
    transactions_serializable = convert_to_json_serializable(transactions)
    return jsonify({"transactions": transactions_serializable})


if __name__ == "__main__":
    app.run(debug=True)