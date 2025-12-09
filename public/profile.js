const API_BASE = "http://localhost:5000/api";
const token = localStorage.getItem("token");

// Redirect to registration if not logged in
if (!token) {
    window.location.href = "register.html";
}

document.addEventListener("DOMContentLoaded", () => {
    loadUserProfile();
});

async function loadUserProfile() {
    try {
        const res = await fetch(`${API_BASE}/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error("Failed to fetch profile");
        }

        const user = await res.json();
        document.getElementById("name").value = user.name;
        document.getElementById("email").value = user.email;
        if (user.profile_picture_url) {
            document.getElementById("profileImage").src = user.profile_picture_url;
        }

    } catch (error) {
        console.error("Error loading profile:", error);
        alert("Could not load your profile data.");
    }
}

// Handle profile information update
document.getElementById("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("name").value;

    try {
        const res = await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Failed to update profile");
        }
        
        localStorage.setItem("user_name", name);
        alert("Profile updated successfully!");

    } catch (error) {
        console.error("Error updating profile:", error);
        alert(error.message);
    }
});


// Handle password change
document.getElementById("passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;

    try {
        const res = await fetch(`${API_BASE}/profile/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update password");
        
        alert("Password updated successfully!");
        document.getElementById("passwordForm").reset();

    } catch (error) {
        console.error("Error updating password:", error);
        alert(error.message);
    }
});


// Handle profile picture upload
document.getElementById("imageUpload").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("profilePicture", file);

    try {
        const res = await fetch(`${API_BASE}/profile/picture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        
        document.getElementById("profileImage").src = data.url;
        alert("Profile picture updated!");

    } catch(error) {
        console.error("Error uploading picture:", error);
        alert(error.message);
    }
});