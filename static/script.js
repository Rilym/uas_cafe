// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables & Initializations ---
    const menuTableBody = document.querySelector('#menuTable tbody');
    const memberTableBody = document.querySelector('#memberTable tbody');
    const transactionTableBody = document.querySelector('#transactionTable tbody');
    const addMenuForm = document.getElementById('addMenuForm');
    const editMenuForm = document.getElementById('editMenuForm');
    const editMenuFormContainer = document.getElementById('editMenuFormContainer');
    const cancelEditMenuBtn = document.getElementById('cancelEditMenuBtn');
    const addMemberForm = document.getElementById('addMemberForm');
    const processOrderForm = document.getElementById('processOrderForm');
    const orderResultDiv = document.getElementById('orderResult');

    // Dashboard elements
    const totalTransactionsTodayElem = document.getElementById('total-transactions-today');
    const totalRevenueTodayElem = document.getElementById('total-revenue-today');
    const dailyTransactionChartCanvas = document.getElementById('dailyTransactionChart');
    let dailyTransactionChart; // Variable to hold the Chart.js instance

    // Export Button
    const exportTransactionsBtn = document.getElementById('exportTransactionsBtn');

    // Navigation Logic elements
    const navButtons = document.querySelectorAll('.nav-btn');
    const contentSections = document.querySelectorAll('.content-section');

    // ***PERUBAHAN: Mengacu pada elemen <select> baru untuk menu pesanan***
    const orderMenuIdSelect = document.getElementById('orderMenuId'); 

    // Variabel global untuk menyimpan data transaksi mentah (penting untuk ekspor rapi)
    let rawTransactionData = []; 

    // --- Navigation Logic ---
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            navButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to the clicked button
            button.classList.add('active');

            // Hide all content sections
            contentSections.forEach(section => section.style.display = 'none');

            // Show the target section
            const targetId = button.dataset.target;
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';

                // Load data specific to the section
                if (targetId === 'dashboard-section') {
                    fetchDailyTransactionSummary();
                } else if (targetId === 'menu-section') {
                    fetchMenu(); // Ini akan memicu pengisian dropdown menu
                    editMenuFormContainer.style.display = 'none'; // Hide edit form when navigating
                } else if (targetId === 'member-section') {
                    fetchMembers();
                    fetchNextMemberId(); // Fetch new ID when opening member section
                } else if (targetId === 'transaction-list-section') {
                    fetchTransactions(); 
                } else if (targetId === 'transaction-process-section') {
                    // ***PERBAHAN: Pastikan dropdown menu juga direset/diisi ulang di sini***
                    fetchMenuForDropdown(); // Fungsi baru untuk khusus mengisi dropdown menu
                    orderResultDiv.style.display = 'none'; 
                    orderResultDiv.textContent = '';
                    processOrderForm.reset(); 
                }
            }
        });
    });

    // --- Helper Functions ---

    function formatRupiah(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    function showMessage(element, message, type) {
        element.textContent = message;
        element.className = `result-message ${type}`; 
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
            element.textContent = '';
        }, 5000); 
    }

    // --- Export to Excel (CSV) Functionality ---
    if (exportTransactionsBtn) { 
        exportTransactionsBtn.addEventListener('click', () => {
            exportDataToCSV(rawTransactionData, 'Excel Cafe Nopek.csv'); 
        });
    }

    function exportDataToCSV(dataArray, filename) {
        if (!dataArray || dataArray.length === 0) {
            alert('Tidak ada data transaksi untuk diekspor.');
            return;
        }

        let csv = [];
        
        // 1. Definisikan Header secara eksplisit (sesuai urutan kolom yang diinginkan di Excel)
        const headers = [
            "ID Transaksi", 
            "Waktu", 
            "ID Member", 
            "Menu", 
            "Jumlah", 
            "Harga Satuan", 
            "Total Asli", 
            "Diskon", 
            "Total Bayar"
        ];
        const cleanHeaders = headers.map(h => {
            h = h.replace(/"/g, '""');
            if (h.includes(',') || h.includes('\n')) return `"${h}"`;
            return h;
        });
        csv.push(cleanHeaders.join(','));

        // 2. Ambil Data dari Array Mentah
        dataArray.forEach(trans => {
            let rowData = [];
            
            rowData.push(trans.transaksiId);

            let dateForExcel = '';
            try {
                const dateObj = new Date(trans.timestamp_iso);
                if (!isNaN(dateObj.getTime())) { 
                    dateForExcel = dateObj.getFullYear() + '-' + 
                                   (dateObj.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                                   dateObj.getDate().toString().padStart(2, '0') + ' ' +
                                   dateObj.getHours().toString().padStart(2, '0') + ':' +
                                   dateObj.getMinutes().toString().padStart(2, '0') + ':' +
                                   dateObj.getSeconds().toString().padStart(2, '0');
                }
            } catch (e) {
                console.warn("Gagal memparsing tanggal untuk ekspor (data mentah):", trans.timestamp_iso, e);
                dateForExcel = trans.timestamp_iso; 
            }
            rowData.push(dateForExcel);

            rowData.push(trans.member_id || '-'); 
            rowData.push(trans.menu_item);
            rowData.push(trans.quantity);
            rowData.push(trans.harga_satuan);
            rowData.push(trans.harga_asli);
            rowData.push(trans.diskon);
            rowData.push(trans.harga_final);

            const cleanedRowData = rowData.map(cell => {
                let cellStr = String(cell); 
                cellStr = cellStr.replace(/"/g, '""'); 
                if (cellStr.includes(',') || cellStr.includes('\n')) { 
                    cellStr = `"${cellStr}"`; 
                }
                return cellStr;
            });
            csv.push(cleanedRowData.join(','));
        });

        const csvString = csv.join('\n');
        const BOM = '\uFEFF'; 
        const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' }); 

        const link = document.createElement('a');
        if (link.download !== undefined) { 
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden'; 
            document.body.appendChild(link);
            link.click(); 
            document.body.removeChild(link); 
        } else {
            alert('Browser Anda mungkin tidak mendukung download file secara langsung. Silakan salin data dari tabel secara manual dan tempelkan ke spreadsheet.');
        }
    }


    // --- API Calls & Data Rendering ---

    // Dashboard: Fetch Daily Transaction Summary
    async function fetchDailyTransactionSummary() {
        try {
            const response = await fetch('/transactions/daily_summary');
            const data = await response.json(); 

            totalTransactionsTodayElem.textContent = data.totalTransactions;
            totalRevenueTodayElem.textContent = formatRupiah(data.totalRevenue);

            renderDailyTransactionChart(data);

        } catch (error) {
            console.error('Error fetching daily transaction summary:', error);
            totalTransactionsTodayElem.textContent = 'N/A';
            totalRevenueTodayElem.textContent = 'N/A';
            if (dailyTransactionChart) {
                dailyTransactionChart.destroy();
                dailyTransactionChart = null; 
            }
            const ctx = dailyTransactionChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, dailyTransactionChartCanvas.width, dailyTransactionChartCanvas.height);
            ctx.font = "32px Arial";
            ctx.fillStyle = "#888";
            ctx.textAlign = "center";
            ctx.fillText("Data transaksi harian tidak tersedia", dailyTransactionChartCanvas.width / 2, dailyTransactionChartCanvas.height / 2);
        }
    }

    // Dashboard: Render Daily Transaction Chart
    function renderDailyTransactionChart(data) {
        const ctx = dailyTransactionChartCanvas.getContext('2d');

        if (dailyTransactionChart) {
            dailyTransactionChart.destroy();
        }

        dailyTransactionChart = new Chart(ctx, {
            type: 'bar', 
            data: {
                labels: [data.date], 
                datasets: [
                    {
                        label: 'Total Transaksi',
                        data: [data.totalTransactions],
                        backgroundColor: 'rgba(52, 152, 219, 0.7)', 
                        borderColor: 'rgba(52, 152, 219, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Total Pendapatan (Rp)',
                        data: [data.totalRevenue],
                        backgroundColor: 'rgba(46, 204, 113, 0.7)', 
                        borderColor: 'rgba(46, 204, 113, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, 
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Jumlah / Pendapatan'
                        },
                        ticks: { 
                            callback: function(value, index, values) {
                                if (this.chart.data.datasets && this.chart.data.datasets.length > 1 && this.chart.data.datasets[1].label === 'Total Pendapatan (Rp)') {
                                   return value > 0 ? formatRupiah(value) : value; 
                                }
                                return value;
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Tanggal'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Ringkasan Transaksi Hari Ini'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.dataset.label === 'Total Pendapatan (Rp)') {
                                    label += formatRupiah(context.raw);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }


    // Menu: Fetch and Display (juga untuk mengisi dropdown menu transaksi)
    async function fetchMenu() {
        try {
            const response = await fetch('/menu');
            const data = await response.json(); 
            menuTableBody.innerHTML = ''; 
            
            // ***PERUBAHAN: Isi juga dropdown menu transaksi di sini***
            orderMenuIdSelect.innerHTML = '<option value="">-- Memuat Menu... --</option>'; // Reset dropdown dengan placeholder
            
            data.menu.forEach(item => {
                // Untuk tabel menu
                const row = menuTableBody.insertRow();
                row.insertCell(0).textContent = item.menuId;
                row.insertCell(1).textContent = item.namaMakanan;
                row.insertCell(2).textContent = formatRupiah(item.hargaMakanan);
                const actionsCell = row.insertCell(3);

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
                editBtn.onclick = () => showEditMenuForm(item);
                actionsCell.appendChild(editBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Hapus';
                deleteBtn.onclick = () => deleteMenu(item.menuId);
                actionsCell.appendChild(deleteBtn);

                // Untuk dropdown transaksi
                const option = document.createElement('option');
                option.value = item.menuId; // Nilai yang akan dikirim ke backend
                option.textContent = `${item.namaMakanan} (Rp ${formatRupiah(item.hargaMakanan)})`; // Tampilkan nama & harga
                orderMenuIdSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching menu:', error);
            menuTableBody.innerHTML = '<tr><td colspan="4">Gagal memuat data menu.</td></tr>';
        }
    }

    // Menu: Add
    addMenuForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addMenuForm);
        const data = Object.fromEntries(formData.entries());
        data.hargaMakanan = parseFloat(data.hargaMakanan); 

        try {
            const response = await fetch('/menu', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json(); 
            if (response.ok) {
                showMessage(orderResultDiv, result.message, 'success');
                addMenuForm.reset();
                fetchMenu(); // Refresh menu list (dan dropdown)
            } else {
                showMessage(orderResultDiv, result.error || 'Gagal menambah menu.', 'error');
            }
        } catch (error) {
            console.error('Error adding menu:', error);
            showMessage(orderResultDiv, 'Terjadi kesalahan jaringan.', 'error');
        }
    });

    // Menu: Show Edit Form
    function showEditMenuForm(item) {
        document.getElementById('editMenuId').value = item.menuId;
        document.getElementById('editNamaMakanan').value = item.namaMakanan;
        document.getElementById('editHargaMakanan').value = item.hargaMakanan;
        editMenuFormContainer.style.display = 'block';
        window.scrollTo({ top: editMenuFormContainer.offsetTop, behavior: 'smooth' }); 
    }

    // Menu: Cancel Edit
    cancelEditMenuBtn.addEventListener('click', () => {
        editMenuFormContainer.style.display = 'none';
        editMenuForm.reset();
    });

    // Menu: Update
    editMenuForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(editMenuForm);
        const data = Object.fromEntries(formData.entries());
        data.menuId = parseInt(data.menuId); 
        data.hargaMakanan = parseFloat(data.hargaMakanan); 

        try {
            const response = await fetch('/menu', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json(); 
            if (response.ok) {
                showMessage(orderResultDiv, result.message, 'success');
                editMenuFormContainer.style.display = 'none';
                editMenuForm.reset();
                fetchMenu(); 
            } else {
                showMessage(orderResultDiv, result.error || 'Gagal mengupdate menu.', 'error');
            }
        } catch (error) {
            console.error('Error updating menu:', error);
            showMessage(orderResultDiv, 'Terjadi kesalahan jaringan.', 'error');
        }
    });

    // Menu: Delete
    async function deleteMenu(menuId) {
        if (!confirm(`Apakah Anda yakin ingin menghapus menu ID ${menuId}?`)) {
            return;
        }
        try {
            const response = await fetch('/menu', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ menuId: menuId })
            });
            const result = await response.json(); 
            if (response.ok) {
                showMessage(orderResultDiv, result.message, 'success');
                fetchMenu(); 
            } else {
                showMessage(orderResultDiv, result.error || 'Gagal menghapus menu.', 'error');
            }
        } catch (error) {
            console.error('Error deleting menu:', error);
            showMessage(orderResultDiv, 'Terjadi kesalahan jaringan.', 'error');
        }
    }

    // Member: Fetch and Display
    async function fetchMembers() {
        try {
            const response = await fetch('/members');
            const data = await response.json(); 
            memberTableBody.innerHTML = ''; 
            data.members.forEach(member => {
                const row = memberTableBody.insertRow();
                row.insertCell(0).textContent = member.id;
                row.insertCell(1).textContent = member.name;
            });
        } catch (error) {
            console.error('Error fetching members:', error);
            memberTableBody.innerHTML = '<tr><td colspan="2">Gagal memuat data member.</td></tr>';
        }
    }

    // Member: Fetch Next ID
    async function fetchNextMemberId() {
        try {
            const response = await fetch('/members/next_id');
            const data = await response.json(); 
            document.getElementById('memberId').value = data.nextId;
        } catch (error) {
            console.error('Error fetching next member ID:', error);
            document.getElementById('memberId').value = 'Error';
        }
    }

    // Member: Add
    addMemberForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addMemberForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/members', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json(); 
            if (response.ok) {
                showMessage(orderResultDiv, result.message, 'success');
                addMemberForm.reset();
                fetchMembers(); 
                fetchNextMemberId(); 
            } else {
                showMessage(orderResultDiv, result.error || 'Gagal menambah member.', 'error');
            }
        } catch (error) {
            console.error('Error adding member:', error);
            showMessage(orderResultDiv, 'Terjadi kesalahan jaringan.', 'error');
        }
    });

    // Transaction: Process Order
    processOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(processOrderForm);
        const data = Object.fromEntries(formData.entries());
        // ***PERBAHAN: Ambil menuId dari dropdown (orderMenuIdSelect) dan pastikan itu angka***
        data.menuId = parseInt(orderMenuIdSelect.value); // Mengambil value dari dropdown
        data.jumlah = parseInt(data.jumlah);

        // ***PERBAHAN: Validasi jika tidak ada menu yang dipilih dari dropdown***
        if (!data.menuId) { // Jika value dari dropdown masih kosong
            showMessage(orderResultDiv, 'Pilih makanan dari daftar menu.', 'error');
            return; 
        }

        try {
            const response = await fetch('/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            const result = await response.json(); 
            if (response.ok) {
                let message = `Pesanan berhasil! Total bayar: ${formatRupiah(result.total_bayar)}`;
                if (result.is_member) {
                    message += ` (Diskon member ${formatRupiah(result.diskon)})`;
                }
                showMessage(orderResultDiv, message, 'success');
                processOrderForm.reset();
                // ***PERBAHAN: Reset juga dropdown setelah submit***
                orderMenuIdSelect.value = ''; 
            } else {
                showMessage(orderResultDiv, result.error || 'Gagal memproses pesanan.', 'error');
            }
        } catch (error) {
            console.error('Error processing order:', error);
            showMessage(orderResultDiv, 'Terjadi kesalahan jaringan.', 'error');
        }
    });

    // Transaction: Fetch and Display
    async function fetchTransactions() {
        try {
            const response = await fetch('/transactions');
            const data = await response.json(); 
            rawTransactionData = data.transactions; // Simpan data mentah di variabel global
            
            transactionTableBody.innerHTML = ''; 
            rawTransactionData.forEach(trans => { 
                const row = transactionTableBody.insertRow();
                row.insertCell(0).textContent = trans.transaksiId;
                const date = new Date(trans.timestamp_iso);
                row.insertCell(1).textContent = date.toLocaleString('id-ID', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
                row.insertCell(2).textContent = trans.member_id || '-';
                row.insertCell(3).textContent = trans.menu_item;
                row.insertCell(4).textContent = trans.quantity;
                row.insertCell(5).textContent = formatRupiah(trans.harga_satuan);
                row.insertCell(6).textContent = formatRupiah(trans.harga_asli);
                row.insertCell(7).textContent = formatRupiah(trans.diskon);
                row.insertCell(8).textContent = formatRupiah(trans.harga_final);
            });
        } catch (error) {
            console.error('Error fetching transactions:', error);
            transactionTableBody.innerHTML = '<tr><td colspan="9">Gagal memuat data transaksi.</td></tr>';
        }
    }

    // --- Initial Load ---
    document.querySelector('.nav-btn[data-target="dashboard-section"]').click();
});