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
  updateDoc,
  setDoc,
  getDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 🛑 DÁN CẤU HÌNH FIREBASE V2 CỦA BẠN VÀO ĐÂY:
const firebaseConfig = {
  apiKey: "AIzaSyB_PZQJndlgeZMlWVc-HnWPdy9IUT_HKv4",
  authDomain: "snartshare-qlds-v2.firebaseapp.com",
  projectId: "snartshare-qlds-v2",
  storageBucket: "snartshare-qlds-v2.firebasestorage.app",
  messagingSenderId: "915299127922",
  appId: "1:915299127922:web:1e3ae81f9e1392418868eb",
  measurementId: "G-S4LQBX8E3C",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

enableIndexedDbPersistence(db).catch((err) => {
  console.log("Lỗi offline: ", err.code);
});

// Các biến toàn cục cho V2
let activeUserEmail = "";
let activeUserName = "";
let currentRoomCode = ""; // Mã phòng đang vào
let isAdmin = false; // Quyền Admin theo phòng
let currentMonthExpenses = [];
let unsubscribeSnapshot = null; // Biến để ngắt kết nối dữ liệu phòng cũ khi đổi phòng

// Hàm tạo mã phòng ngẫu nhiên (6 ký tự)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- 1. LẮNG NGHE TRẠNG THÁI ĐĂNG NHẬP ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    activeUserEmail = user.email;
    activeUserName = user.email.split("@")[0];

    document.getElementById("userNameDisplay").innerText = activeUserName;
    // Ẩn login, hiện sảnh chọn phòng
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app-section").style.display = "none";
    document.getElementById("room-selection").style.display = "block";
  } else {
    document.getElementById("login-section").style.display = "block";
    document.getElementById("room-selection").style.display = "none";
    document.getElementById("app-section").style.display = "none";
    currentRoomCode = "";
    isAdmin = false;
  }
});

// Đăng ký, Đăng nhập, Đăng xuất (Giữ nguyên luồng cũ)
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

document.getElementById("btnLogin").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById("login-error").style.display = "none";
  } catch (error) {
    document.getElementById("login-error").innerText = "Sai thông tin!";
    document.getElementById("login-error").style.display = "block";
  }
});

document.getElementById("btnLogout").addEventListener("click", () => {
  signOut(auth);
});

// --- 2. XỬ LÝ SẢNH CHỜ (TẠO PHÒNG & VÀO PHÒNG) ---

// TẠO PHÒNG MỚI (Trở thành Admin)
// TẠO PHÒNG MỚI (Trở thành Admin)
document.getElementById("btnCreateRoom").addEventListener("click", async () => {
  // Lấy mã phòng do user tự gõ
  const newCode = document
    .getElementById("createRoomCode")
    .value.trim()
    .toUpperCase();
  if (!newCode) return alert("Vui lòng nhập tên mã phòng bạn muốn tạo!");

  document.getElementById("btnCreateRoom").innerText = "Đang kiểm tra...";
  try {
    const roomRef = doc(db, "rooms", newCode);
    const roomSnap = await getDoc(roomRef);

    // Kiểm tra xem mã này đã có ai xài chưa
    if (roomSnap.exists()) {
      document.getElementById("btnCreateRoom").innerText = "Tạo Phòng Ngay";
      return alert(
        "Mã phòng này đã có người sử dụng! Vui lòng nghĩ một mã khác (VD: " +
          newCode +
          "99).",
      );
    }

    // Nếu chưa ai xài thì tiến hành tạo
    await setDoc(roomRef, {
      adminEmail: activeUserEmail,
      members: [activeUserEmail],
      createdAt: new Date(),
    });
    alert(
      `Tạo phòng thành công! Mã phòng của bạn là: ${newCode}\nHãy gửi mã này cho thành viên khác để tham gia.`,
    );
    enterRoom(newCode, true);
  } catch (e) {
    alert("Lỗi tạo phòng: " + e.message);
  }
  document.getElementById("btnCreateRoom").innerText = "Tạo Phòng Ngay";
});

// THAM GIA PHÒNG (Thành viên)
document.getElementById("btnJoinRoom").addEventListener("click", async () => {
  const codeInput = document
    .getElementById("joinRoomCode")
    .value.trim()
    .toUpperCase();
  if (!codeInput) return alert("Vui lòng nhập mã phòng!");

  try {
    const roomRef = doc(db, "rooms", codeInput);
    const roomSnap = await getDoc(roomRef);

    if (roomSnap.exists()) {
      // Thêm user vào danh sách members của phòng đó
      await updateDoc(roomRef, { members: arrayUnion(activeUserEmail) });

      const roomData = roomSnap.data();
      const checkAdmin = roomData.adminEmail === activeUserEmail;
      alert("Vào phòng thành công!");
      enterRoom(codeInput, checkAdmin);
    } else {
      alert("Mã phòng không tồn tại!");
    }
  } catch (e) {
    alert("Lỗi khi tham gia phòng: " + e.message);
  }
});

// Hàm khởi tạo sau khi vào phòng thành công
function enterRoom(code, adminStatus) {
  currentRoomCode = code;
  isAdmin = adminStatus;

  document.getElementById("room-selection").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  document.getElementById("currentRoomDisplay").innerText = code;

  document.getElementById("currentUserDisplay").innerText =
    activeUserName + (isAdmin ? " (Trưởng phòng)" : " (Thành viên)");
  document.getElementById("btnSettle").style.display = isAdmin
    ? "inline-block"
    : "none";

  loadDataRealtime(); // Tải dữ liệu riêng của phòng này
}

// --- 3. CÁC HÀM CŨ ĐƯỢC CẬP NHẬT TRUY VẤN THEO PHÒNG ---

document.getElementById("btnAddExpense").addEventListener("click", async () => {
  const name = document.getElementById("itemName").value;
  const price = document.getElementById("itemPrice").value;
  if (!name || !price) return alert("Vui lòng nhập đủ thông tin!");

  document.getElementById("btnAddExpense").innerText = "Đang lưu...";
  try {
    // ⚠️ QUAN TRỌNG: Lưu vào subcollection 'expenses' CỦA phòng hiện tại
    const roomExpensesRef = collection(
      db,
      "rooms",
      currentRoomCode,
      "expenses",
    );
    await addDoc(roomExpensesRef, {
      name: name,
      price: parseInt(price),
      payerEmail: activeUserEmail,
      payer: activeUserName,
      timestamp: new Date(),
      dateString: new Date().toLocaleDateString("vi-VN"),
      pendingDelete: false,
    });
    document.getElementById("itemName").value = "";
    document.getElementById("itemPrice").value = "";
  } catch (e) {
    alert("Lỗi khi lưu!");
  }
  document.getElementById("btnAddExpense").innerText = "Thêm khoản chi";
});

function loadDataRealtime() {
  if (unsubscribeSnapshot) unsubscribeSnapshot(); // Xóa luồng dữ liệu cũ nếu có

  // ⚠️ QUAN TRỌNG: Chỉ lấy dữ liệu từ subcollection 'expenses' CỦA phòng hiện tại
  const roomExpensesRef = collection(db, "rooms", currentRoomCode, "expenses");
  const q = query(roomExpensesRef, orderBy("timestamp", "desc"));

  unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
    const listElement = document.getElementById("expenseList");
    listElement.innerHTML = "";
    let total = 0;
    currentMonthExpenses = [];

    const isOffline = snapshot.metadata.fromCache;
    document.getElementById("network-status").innerText = isOffline
      ? "Đang Offline (Lưu tạm)"
      : "Đã đồng bộ Online";
    document.getElementById("network-status").style.backgroundColor = isOffline
      ? "#ff9800"
      : "#4caf50";

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      if (!item.pendingDelete) {
        currentMonthExpenses.push(item);
        total += item.price;
      }

      const li = document.createElement("li");
      let actionButtons = "";
      if (item.pendingDelete) {
        if (isAdmin) {
          actionButtons = `<button class="btn-approve" data-id="${docSnap.id}" style="background: #dc3545;">Duyệt Xóa</button>
                             <button class="btn-reject" data-id="${docSnap.id}" style="background: #6c757d;">Từ chối</button>`;
        } else {
          actionButtons = `<span style="color: #ff9800; font-size: 13px; font-weight: bold;">⏳ Đang chờ duyệt</span>`;
        }
      } else {
        if (isAdmin || item.payerEmail === activeUserEmail) {
          actionButtons = `<button class="btn-request-delete" data-id="${docSnap.id}">Xóa</button>`;
        }
      }

      li.innerHTML = `<div style="${item.pendingDelete ? "opacity: 0.5;" : ""}"><strong>${item.name}</strong> - ${item.price.toLocaleString("vi-VN")} VNĐ <br><small>Người mua: ${item.payer} (${item.dateString})</small></div><div>${actionButtons}</div>`;
      listElement.appendChild(li);
    });
    document.getElementById("totalAmount").innerText =
      total.toLocaleString("vi-VN");

    // Xử lý sự kiện Xóa và Duyệt (Nhớ đổi đường dẫn doc)
    document.querySelectorAll(".btn-request-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const docId = e.target.getAttribute("data-id");
        const expenseDoc = doc(db, "rooms", currentRoomCode, "expenses", docId);
        if (isAdmin) {
          if (confirm("Xóa mục này?")) await deleteDoc(expenseDoc);
        } else {
          if (confirm("Gửi yêu cầu xóa cho Trưởng phòng?"))
            await updateDoc(expenseDoc, { pendingDelete: true });
        }
      });
    });

    document.querySelectorAll(".btn-approve").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        await deleteDoc(
          doc(
            db,
            "rooms",
            currentRoomCode,
            "expenses",
            e.target.getAttribute("data-id"),
          ),
        );
      });
    });
    document.querySelectorAll(".btn-reject").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        await updateDoc(
          doc(
            db,
            "rooms",
            currentRoomCode,
            "expenses",
            e.target.getAttribute("data-id"),
          ),
          { pendingDelete: false },
        );
      });
    });
  });
}

// Nút chốt sổ giữ nguyên như bản V1
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
