
import { useState } from "react";
import "./App.css";

const districts = [
  { name: "Ludhiana", users: 3200 },
  { name: "Amritsar", users: 2600 },
  { name: "Jalandhar", users: 2100 },
  { name: "Patiala", users: 1800 },
  { name: "Bathinda", users: 1200 },
];

const activities = [
  { name: "Rahul Sharma", action: "Viewed Software Developer Job", time: "2 min ago" },
  { name: "Priya Kaur", action: "Applied for Teaching Job", time: "10 min ago" },
  { name: "Aman Singh", action: "Searched Government Jobs", time: "15 min ago" },
  { name: "Simran Gill", action: "Viewed Skill Development Scheme", time: "25 min ago" },
];

const categories = [
  { name: "IT & Software", percentage: 85 },
  { name: "Government Jobs", percentage: 70 },
  { name: "Teaching", percentage: 55 },
  { name: "Healthcare", percentage: 40 },
  { name: "Manufacturing", percentage: 30 },
];

function App() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div className="dashboard">

      {/* Sidebar */}
      <aside className="sidebar">
        <h2>🇮🇳 PGRKAM</h2>
        <p className="sidebar-subtitle">Employment Analytics</p>

        <nav>
          {["Overview", "User Analytics", "Job Analytics", "District Analytics"].map(
            (item) => (
              <button
                key={item}
                className={activeTab === item ? "nav-item active" : "nav-item"}
                onClick={() => setActiveTab(item)}
              >
                {item}
              </button>
            )
          )}
        </nav>

        <div className="sidebar-footer">
          <p>Punjab Government</p>
          <small>Analytics Portal v1.0</small>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">

        <header className="topbar">
          <div>
            <h1>{activeTab}</h1>
            <p>Welcome to PGRKAM Analytics Dashboard</p>
          </div>
          <div className="admin">👤 Admin</div>
        </header>

        {/* Statistics Cards */}
        <section className="stats-grid">
          <div className="stat-card blue">
            <span>Total Users</span>
            <h2>12,450</h2>
            <small>↑ 12% this month</small>
          </div>

          <div className="stat-card green">
            <span>Job Views</span>
            <h2>3,280</h2>
            <small>↑ 8% this month</small>
          </div>

          <div className="stat-card purple">
            <span>Applications</span>
            <h2>1,840</h2>
            <small>↑ 15% this month</small>
          </div>

          <div className="stat-card orange">
            <span>Active Users</span>
            <h2>9,460</h2>
            <small>76% engagement</small>
          </div>
        </section>

        {/* Analytics Sections */}
        <section className="analytics-grid">

          {/* District Analytics */}
          <div className="panel">
            <h3>District-wise Users</h3>
            <p className="description">Users across Punjab districts</p>

            {districts.map((district) => (
              <div className="district-row" key={district.name}>
                <div className="district-info">
                  <span>{district.name}</span>
                  <strong>{district.users.toLocaleString()}</strong>
                </div>
                <div className="progress-bg">
                  <div
                    className="progress-fill"
                    style={{ width: `${district.users / 3200 * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

          {/* Job Categories */}
          <div className="panel">
            <h3>Popular Job Categories</h3>
            <p className="description">Interest based on job views</p>

            {categories.map((category) => (
              <div className="category-row" key={category.name}>
                <div className="category-info">
                  <span>{category.name}</span>
                  <strong>{category.percentage}%</strong>
                </div>
                <div className="progress-bg">
                  <div
                    className="progress-fill category-fill"
                    style={{ width: `${category.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>

        </section>

        {/* Recent Activity */}
        <section className="panel activity-panel">
          <h3>Recent User Activity</h3>
          <p className="description">Latest activity on the platform</p>

          <div className="activity-header">
            <span>User</span>
            <span>Activity</span>
            <span>Time</span>
          </div>

          {activities.map((activity, index) => (
            <div className="activity-row" key={index}>
              <strong>{activity.name}</strong>
              <span>{activity.action}</span>
              <small>{activity.time}</small>
            </div>
          ))}
        </section>

        <footer>
          © 2026 PGRKAM | Punjab Government Employment Analytics
        </footer>

      </main>
    </div>
  );
}

export default App;
