// 🌟 Register User
function registerUser(event) {
    event.preventDefault();

    let name = document.getElementById("name").value;
    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;
    let confirmPassword = document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        alert("Passwords do not match!");
        return false;
    }

    let user = { name, email, password };
    localStorage.setItem("user", JSON.stringify(user));
    alert("Registration successful! Redirecting to login.");
    window.location.href = "login.html"; // Redirect to login page
}

// 🔑 Login User
function loginUser(event) {
    event.preventDefault();

    let email = document.getElementById("email").value;
    let password = document.getElementById("password").value;
    let storedUser = JSON.parse(localStorage.getItem("user"));

    if (!storedUser || storedUser.email !== email || storedUser.password !== password) {
        alert("Invalid email or password!");
        return false;
    }

    localStorage.setItem("user_name", storedUser.name);
    alert("Login successful! Redirecting to chat.");
    window.location.href = "chat.html"; // Redirect to chat page
}

// 📩 Send Message
function sendMessage() {
    let messageInput = document.getElementById("messageInput");
    let message = messageInput.value.trim();
    if (message === "") return;

    let chatBox = document.getElementById("chatBox");
    let newMessage = document.createElement("p");
    newMessage.textContent = localStorage.getItem("user_name") + ": " + message;
    chatBox.appendChild(newMessage);

    let messages = JSON.parse(localStorage.getItem("chat_messages")) || [];
    messages.push(newMessage.textContent);
    localStorage.setItem("chat_messages", JSON.stringify(messages));

    messageInput.value = ""; // Clear input
    document.getElementById("previewText").textContent = ""; // Clear preview
}

// 🔄 Load Previous Messages
function loadMessages() {
    let chatBox = document.getElementById("chatBox");
    let messages = JSON.parse(localStorage.getItem("chat_messages")) || [];
    messages.forEach(msg => {
        let messageElement = document.createElement("p");
        messageElement.textContent = msg;
        chatBox.appendChild(messageElement);
    });
}

// 👀 Preview Message Before Sending
function previewMessage() {
    let messageInput = document.getElementById("messageInput").value;
    let previewText = document.getElementById("previewText");

    if (messageInput.trim() === "") {
        previewText.textContent = "";
    } else {
        previewText.textContent = localStorage.getItem("user_name") + ": " + messageInput;
    }
}

// 🏁 Check Login Status
document.addEventListener("DOMContentLoaded", function() {
    if (document.getElementById("username")) {
        let userName = localStorage.getItem("user_name");
        if (!userName) {
            window.location.href = "login.html"; // Redirect if not logged in
        }
        document.getElementById("username").innerText = userName;
        loadMessages();
    }
});

// 🔴 Logout User
function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html"; // Redirect to login
}

// ⏎ Send Message on Enter Key
document.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

