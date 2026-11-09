import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpFetch } from "../lib/http";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("teacher"); // teacher | student
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Demo-only convenience:
  // Selecting Teacher/Student pre-fills demo credentials and hides the need
  // to manually type them. Backend still verifies the account.
  useEffect(() => {
    if (mode === "teacher") {
      setEmail("teacher@demo.com");
      setPassword("password123");
      return;
    }
    setEmail("student1@demo.com");
    setPassword("password123");
  }, [mode]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    // Optional: keep the role toggle as a UX hint.
    // Auth is still driven by the DB role returned by /login.
    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    try {
      const response = await httpFetch(`/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      const user = await response.json();

      const normalizedRole = String(user?.role || "").toLowerCase();
      if (normalizedRole !== mode) {
        // Keep it one login page, but require selecting the correct portal.
        setError(
          `This account is a ${normalizedRole || "different"} role. Please select ${
            normalizedRole || "the correct"
          } portal and try again.`
        );
        localStorage.removeItem("user");
        return;
      }

      localStorage.setItem("user", JSON.stringify(user));
      navigate(`/${mode}`, { replace: true });
    } catch {
      setError("Login failed. Check email and password.");
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleLogin} style={styles.form}>
        <div style={styles.brandRow}>
          <div style={styles.brandMark} aria-hidden="true" />
          <div>
            <h2 style={styles.title}>Matheta Login</h2>
            <div style={styles.subTitle}>Demo mode</div>
          </div>
        </div>

        <div style={styles.segmentRow}>
          <button
            type="button"
            onClick={() => setMode("teacher")}
            style={{
              ...styles.segmentBtn,
              ...(mode === "teacher" ? styles.segmentBtnActive : null),
            }}
          >
            Teacher
          </button>
          <button
            type="button"
            onClick={() => setMode("student")}
            style={{
              ...styles.segmentBtn,
              ...(mode === "student" ? styles.segmentBtnActive : null),
            }}
          >
            Student
          </button>
        </div>

        <div style={styles.demoHint}>
          Demo login is automatic. You will sign in as:
          <div style={styles.demoCreds}>
            <span style={styles.mono}>{email}</span>
            <span style={styles.mono}>password123</span>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button type="submit" style={styles.button}>
          Continue
        </button>

        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => navigate("/product")}
        >
          View Product Page
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "#f4f6f9",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    padding: "30px",
    borderRadius: "8px",
    backgroundColor: "white",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
    width: "300px",
  },
  brandRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  brandMark: {
    height: 28,
    width: 28,
    borderRadius: 10,
    background: "linear-gradient(180deg, #111827, #0b1220)",
    boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
    border: "1px solid #e5e7eb",
  },
  title: {
    margin: 0,
    fontSize: 18,
  },
  subTitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 600,
  },
  input: {
    marginBottom: "15px",
    padding: "10px",
    fontSize: "16px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
  },
  button: {
    padding: "10px",
    fontSize: "16px",
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  secondaryButton: {
    marginTop: 10,
    padding: "10px",
    fontSize: 14,
    backgroundColor: "#ffffff",
    color: "#111827",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    cursor: "pointer",
  },
  segmentRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  segmentBtn: {
    padding: "10px",
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundColor: "#f9fafb",
    cursor: "pointer",
  },
  segmentBtnActive: {
    backgroundColor: "#111827",
    color: "white",
    borderColor: "#111827",
  },
  demoHint: {
    marginTop: 6,
    marginBottom: 14,
    padding: 10,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    fontSize: 13,
    color: "#374151",
  },
  demoCreds: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 6,
    marginTop: 8,
  },
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    padding: 8,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    backgroundColor: "white",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  error: {
    color: "red",
    marginBottom: "10px",
  },
};

export default Login;
