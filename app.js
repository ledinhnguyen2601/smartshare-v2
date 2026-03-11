import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  enableIndexedDbPersistence,
  query,
  orderBy,
  updateDoc, // <-- Đã thêm updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🛑 BẠN DÁN CỤC firebaseConfig CỦA DỰ ÁN QLDS VÀO ĐÂY NHÉ:
const firebaseConfig = {
  apiKey: "AIzaSyB_PZQJndlgeZMlWVc-HnWPdy9IUT_HKv4",
  authDomain: "snartshare-qlds-v2.firebaseapp.com",
  projectId: "snartshare-qlds-v2",
  storageBucket: "snartshare-qlds-v2.firebasestorage.app",
  messagingSenderId: "915299127922",
  appId: "1:915299127922:web:1e3ae81f9e1392418868eb",
  measurementId: "G-S4LQBX8E3C",
};
// 👑 CÀI ĐẶT ADMIN (Điền email trưởng phòng vào đây)
const ADMIN_EMAIL = "nguyen0877780858@gmail.com";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.log("Lỗi offline: ", err.code);
});

const expensesCollection = collection(db, "expenses");
let currentMonthExpenses = [];
let activeUserEmail = "";
let activeUserName = "";
let isAdmin = false; // Biến kiểm tra quyền

// --- 1. LẮNG NGHE ĐĂNG NHẬP & PHÂN QUYỀN ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    activeUserEmail = user.email;
    activeUserName = user.email.split("@")[0];
    isAdmin = activeUserEmail === ADMIN_EMAIL; // Trưởng phòng mới là true

    // Hiển thị tên và (Chức vụ)
    document.getElementById("currentUserDisplay").innerText =
      activeUserName + (isAdmin ? " (Trưởng phòng)" : " (Thành viên)");

    // Chỉ Admin mới thấy nút Chốt sổ
    document.getElementById("btnSettle").style.display = isAdmin
      ? "inline-block"
      : "none";

    document.getElementById("login-section").style.display = "none";
    document.getElementById("app-section").style.display = "block";
    loadDataRealtime();
  } else {
    document.getElementById("login-section").style.display = "block";
    document.getElementById("app-section").style.display = "none";
  }
});

// --- 2. ĐĂNG KÝ (Giữ nguyên) ---
document.getElementById("btnRegister").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Đăng ký thành công!");
  } catch (error) {
    document.getElementById("login-error").innerText = error.message;
    document.getElementById("login-error").style.display = "block";
  }
});

// --- 3. ĐĂNG NHẬP (Giữ nguyên) ---
document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById("login-error").style.display = "none";
  } catch (error) {
    document.getElementById("login-error").innerText =
      "Sai email hoặc mật khẩu!";
    document.getElementById("login-error").style.display = "block";
  }
});

document.getElementById("btnLogout").addEventListener("click", () => {
  signOut(auth);
});

// --- 4. THÊM KHOẢN CHI ---
document.getElementById("btnAddExpense").addEventListener("click", async () => {
  const name = document.getElementById("itemName").value;
  const price = document.getElementById("itemPrice").value;
  if (!name || !price) return alert("Vui lòng nhập đủ thông tin!");

  document.getElementById("btnAddExpense").innerText = "Đang lưu...";
  try {
    await addDoc(expensesCollection, {
      name: name,
      price: parseInt(price),
      payerEmail: activeUserEmail,
      payer: activeUserName,
      timestamp: new Date(),
      dateString: new Date().toLocaleDateString("vi-VN"),
      pendingDelete: false, // Thuộc tính cờ hiệu duyệt xóa
    });
    document.getElementById("itemName").value = "";
    document.getElementById("itemPrice").value = "";
  } catch (e) {
    alert("Lỗi khi lưu!");
  }
  document.getElementById("btnAddExpense").innerText = "Thêm khoản chi";
});

// --- 5. HIỂN THỊ DỮ LIỆU & LUỒNG DUYỆT XÓA ---
function loadDataRealtime() {
  const q = query(expensesCollection, orderBy("timestamp", "desc"));
  onSnapshot(q, (snapshot) => {
    const listElement = document.getElementById("expenseList");
    listElement.innerHTML = "";
    let total = 0;
    currentMonthExpenses = [];

    // TÍNH NĂNG ĐỔI MÀU TRẠNG THÁI MẠNG (ĐÃ THÊM VÀO ĐÂY) 🌟
    const isOffline = snapshot.metadata.fromCache;
    document.getElementById("network-status").innerText = isOffline
      ? "Đang Offline (Lưu tạm)"
      : "Đã đồng bộ Online";
    document.getElementById("network-status").style.backgroundColor = isOffline
      ? "#ff9800"
      : "#4caf50";

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      // Bỏ qua các khoản đang chờ xóa để không tính vào tổng tiền
      if (!item.pendingDelete) {
        currentMonthExpenses.push(item);
        total += item.price;
      }

      const li = document.createElement("li");

      // Xây dựng giao diện nút Xóa tùy theo Quyền và Trạng thái
      let actionButtons = "";
      if (item.pendingDelete) {
        if (isAdmin) {
          actionButtons = `<button class="btn-approve" data-id="${docSnap.id}" style="background: #dc3545;">Duyệt Xóa</button>
                             <button class="btn-reject" data-id="${docSnap.id}" style="background: #6c757d;">Từ chối</button>`;
        } else {
          actionButtons = `<span style="color: #ff9800; font-size: 13px; font-weight: bold;">⏳ Đang chờ Trưởng phòng duyệt xóa</span>`;
        }
      } else {
        // Cho phép người mua hoặc Admin được bấm Xóa
        if (isAdmin || item.payerEmail === activeUserEmail) {
          actionButtons = `<button class="btn-request-delete" data-id="${docSnap.id}">Xóa</button>`;
        }
      }

      li.innerHTML = `
        <div style="${item.pendingDelete ? "opacity: 0.5;" : ""}">
            <strong>${item.name}</strong> - ${item.price.toLocaleString("vi-VN")} VNĐ <br>
            <small>Người mua: ${item.payer} (${item.dateString})</small>
        </div>
        <div>${actionButtons}</div>
      `;
      listElement.appendChild(li);
    });

    document.getElementById("totalAmount").innerText =
      total.toLocaleString("vi-VN");

    // Gắn sự kiện cho các nút Xóa
    document.querySelectorAll(".btn-request-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const docId = e.target.getAttribute("data-id");
        if (isAdmin) {
          // Admin xóa phát bay luôn
          if (confirm("Xóa mục này?"))
            await deleteDoc(doc(db, "expenses", docId));
        } else {
          // User xóa thì đẩy vào trạng thái Chờ
          if (
            confirm(
              "Gửi yêu cầu xóa cho Trưởng phòng? Món này sẽ tạm thời bị trừ khỏi tổng tiền.",
            )
          ) {
            await updateDoc(doc(db, "expenses", docId), {
              pendingDelete: true,
            });
          }
        }
      });
    });

    // Gắn sự kiện Duyệt/Từ chối cho Admin
    document.querySelectorAll(".btn-approve").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        await deleteDoc(doc(db, "expenses", e.target.getAttribute("data-id")));
      });
    });
    document.querySelectorAll(".btn-reject").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        await updateDoc(doc(db, "expenses", e.target.getAttribute("data-id")), {
          pendingDelete: false,
        });
      });
    });
  });
}

// --- 6. CHỐT SỔ (Chỉ Admin bấm được) ---
document.getElementById("btnSettle").addEventListener("click", () => {
  const numPeople = parseInt(
    prompt("Nhập tổng số người trong phòng trọ (Ví dụ: 3):", "3"),
  );
  if (isNaN(numPeople) || numPeople <= 0)
    return alert("Số người không hợp lệ!");

  let totalSpent = 0;
  let paidByMember = {};
  currentMonthExpenses.forEach((exp) => {
    totalSpent += exp.price;
    if (!paidByMember[exp.payer]) paidByMember[exp.payer] = 0;
    paidByMember[exp.payer] += exp.price;
  });

  if (totalSpent === 0)
    return alert("Chưa có khoản chi nào được duyệt để chốt sổ!");
  const average = totalSpent / numPeople;

  const resultList = document.getElementById("settlementList");
  resultList.innerHTML = `<li style="color: blue;"><strong>💵 Trung bình mỗi người chịu:</strong> ${Math.round(average).toLocaleString("vi-VN")} VNĐ</li>`;

  for (const member in paidByMember) {
    const balance = paidByMember[member] - average;
    let statusText = "",
      color = "";
    if (balance > 0) {
      statusText = `Được nhận lại: +${Math.round(balance).toLocaleString("vi-VN")} VNĐ`;
      color = "green";
    } else if (balance < 0) {
      statusText = `Cần đóng thêm: ${Math.round(Math.abs(balance)).toLocaleString("vi-VN")} VNĐ`;
      color = "red";
    } else {
      statusText = "Đã đóng đủ";
      color = "gray";
    }

    const li = document.createElement("li");
    li.innerHTML = `<strong>Tài khoản: ${member}</strong> (Đã chi: ${paidByMember[member].toLocaleString("vi-VN")}) <br> <span style="color: ${color}; font-weight: bold;">${statusText}</span>`;
    resultList.appendChild(li);
  }

  const liNote = document.createElement("li");
  liNote.innerHTML = `<em>*Các thành viên khác trong phòng chưa chi khoản nào cần đóng đủ: ${Math.round(average).toLocaleString("vi-VN")} VNĐ</em>`;
  resultList.appendChild(liNote);
  document.getElementById("settlementResult").style.display = "block";
});
