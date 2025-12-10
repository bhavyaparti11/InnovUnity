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

let userEmail = ""; // Needed to remember who is verifying

// 1. REGISTER FUNCTION
async function registerUser(event) {
    event.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();

        if (res.ok) {
            // ✅ Success: Show the OTP Box
            userEmail = email; 
            document.getElementById('otpModal').style.display = 'flex'; 
        } else {
            alert(data.error || "Registration failed");
        }
    } catch (err) {
        console.error(err);
        alert("Something went wrong. Check console.");
    }
}

// 2. VERIFY FUNCTION
async function verifyOtp() {
    const code = document.getElementById('otpInput').value;
    
    try {
        const res = await fetch('/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail, code })
        });

        const data = await res.json();

        if (res.ok) {
            alert("Verification Successful! Logging you in...");
            window.location.href = 'index.html'; // Redirect to home/login
        } else {
            alert(data.error || "Invalid Code");
        }
    } catch (err) {
        alert("Verification failed.");
    }
}

function closeOtpModal() {
    document.getElementById('otpModal').style.display = 'none';
}
// --- PROJECT CREATION LOGIC ---

// 1. Open the Modal
function openProjectModal() {
    document.getElementById('projectModal').style.display = 'flex';
}

// 2. Close the Modal
function closeProjectModal() {
    document.getElementById('projectModal').style.display = 'none';
    document.getElementById('newProjectName').value = ""; // Clear input
}

// 3. Create Project (Talks to Server)
async function createProject() {
    const nameInput = document.getElementById('newProjectName');
    const name = nameInput.value.trim();
    const token = localStorage.getItem('token'); // Get login token

    if (!name) return alert("Please enter a project name!");

    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // IMPORTANT: Send token
            },
            body: JSON.stringify({ name })
        });

        const data = await res.json();

        if (res.ok) {
            alert("Project Created Successfully!");
            closeProjectModal();
            // Reload the list (or the whole page) to see the new project
            window.location.reload(); 
        } else {
            alert(data.error || "Failed to create project");
        }
    } catch (err) {
        console.error(err);
        alert("Server Error: Could not create project.");
    }
}