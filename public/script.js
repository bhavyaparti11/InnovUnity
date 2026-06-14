async function loginUser(event) {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.error || "Login failed");
            return;
        }

        // Store auth data properly
        localStorage.setItem('token', data.token);

        localStorage.setItem('user', JSON.stringify({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email
        }));

        // Optional convenience keys
        localStorage.setItem('user_name', data.user.name);
        localStorage.setItem('user_id', data.user.id);

        window.location.href = 'chat.html';

    } catch (err) {
        console.error(err);
        alert("Server Error");
    }
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
// --- AI CODE REVIEW & EXPLAIN ---

async function getAiReview(fileId) {
    const token = localStorage.getItem('token');
    if (!token) return alert("You must be logged in to use AI.");

    try {
        // Change to 'Analyzing...' so the user knows it's working
        console.log("Sending code to AI for review...");
        
        const res = await fetch(`/api/codefiles/${fileId}/review`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Display the AI's response!
        alert("🤖 AI Code Review:\n\n" + data.result);
        
    } catch (err) {
        console.error(err);
        alert("Failed to get AI review: " + err.message);
    }
}

async function getAiExplanation(fileId) {
    const token = localStorage.getItem('token');
    if (!token) return alert("You must be logged in to use AI.");

    try {
        console.log("Asking AI to explain...");
        
        const res = await fetch(`/api/codefiles/${fileId}/explain`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Display the AI's response!
        alert("🤖 AI Explanation:\n\n" + data.result);
        
    } catch (err) {
        console.error(err);
        alert("Failed to get AI explanation: " + err.message);
    }
}