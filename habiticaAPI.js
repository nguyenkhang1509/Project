class HabiticaAPI {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.demoData = this.generateDemoData();
  }

  generateDemoData() {
    return {
      "physical-1": {
        name: "Morning Run — 5km",
        summary: "Early morning run for cardiovascular health",
      },
      "physical-2": {
        name: "Gym Session — Strength Training",
        summary: "1 hour focused strength training workout",
      },
      "physical-3": {
        name: "Yoga Flow — 30 minutes",
        summary: "Flexibility and core strength routine",
      },
      "physical-4": {
        name: "Swimming — 45 minutes",
        summary: "Full-body cardio and low-impact exercise",
      },

      "intellectual-1": {
        name: "Read Programming Article",
        summary: "Read and summarize one technical article",
      },
      "intellectual-2": {
        name: "Complete Online Course Module",
        summary: "Finish one module of online learning course",
      },
      "intellectual-3": {
        name: "Problem Solving — Algorithms",
        summary: "Solve 3 coding challenges or LeetCode problems",
      },
      "intellectual-4": {
        name: "Research & Learn New Concept",
        summary: "Deep dive into a new technology or concept",
      },

      "discipline-1": {
        name: "Weekly Reflection Journal",
        summary: "Reflect on wins, failures, and lessons learned",
      },
      "discipline-2": {
        name: "Plan Next Week",
        summary: "Set 3 goals and 5 priorities for next week",
      },
      "discipline-3": {
        name: "No Phone for 2 Hours",
        summary: "Focused time without digital distractions",
      },
      "discipline-4": {
        name: "Budget Review",
        summary: "Review spending and adjust weekly budget",
      },

      "confidence-1": {
        name: "Speak Up in Meeting",
        summary: "Share 1 idea or ask 1 question confidently",
      },
      "confidence-2": {
        name: "Compliment Someone",
        summary: "Give genuine, specific compliment to 1 person",
      },
      "confidence-3": {
        name: "Lead a Discussion",
        summary: "Facilitate or lead a team discussion or meeting",
      },
      "confidence-4": {
        name: "Share Your Work",
        summary: "Present your work or ideas to others",
      },

      "mental-1": {
        name: "Meditation — 10 minutes",
        summary: "Mindfulness meditation with focus on breath",
      },
      "mental-2": {
        name: "Gratitude Practice",
        summary: "Write down 5 things you're grateful for",
      },
      "mental-3": {
        name: "Stress Relief Activity",
        summary: "Do an activity that helps you relax",
      },
      "mental-4": {
        name: "Sleep Early",
        summary: "Get to bed 30 minutes earlier than usual",
      },
    };
  }

  async fetchChallenge(challengeId) {
    if (this.cache.has(challengeId)) {
      return this.cache.get(challengeId);
    }

    try {
      const url = `${this.config.apiBase}/challenges/${challengeId}`;
      const headers = {
        "Content-Type": "application/json",
      };

      if (this.config.userId && this.config.apiToken) {
        headers["x-api-user"] = this.config.userId;
        headers["x-api-key"] = this.config.apiToken;
      }

      const response = await fetch(url, { headers });

      if (response.ok) {
        const json = await response.json();
        const challengeData = json.data || json;
        this.cache.set(challengeId, challengeData);
        return challengeData;
      }
    } catch (error) {
      console.log(`Challenge ${challengeId} not found in API, using demo data`);
    }

    if (this.demoData[challengeId]) {
      const demoChallenge = {
        _id: challengeId,
        id: challengeId,
        name: this.demoData[challengeId].name,
        summary: this.demoData[challengeId].summary,
      };
      this.cache.set(challengeId, demoChallenge);
      return demoChallenge;
    }

    return null;
  }

  async fetchAllChallenges(challengeMap) {
    const results = [];

    for (const [challengeId, category] of Object.entries(challengeMap)) {
      const data = await this.fetchChallenge(challengeId);
      if (data) {
        results.push({
          id: challengeId,
          category,
          ...data,
        });
      }
    }

    return results;
  }

  generateCardHTML(challenge, category) {
    const xpReward =
      this.config.defaultXpPerCategory[category] ||
      this.config.defaultXpPerCategory.mental;
    const statReward =
      this.config.defaultStatPerCategory[category] ||
      this.config.defaultStatPerCategory.mental;

    const categoryIcon = this.getCategoryIcon(category);
    const categoryLabel = this.getCategoryLabel(category);

    const safeId = (challenge.name || challenge.shortName || "challenge")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    return `
      <article class="qcard" data-type="${category}" data-completed="false">
        <button
          class="qcheck"
          type="button"
          aria-label="Toggle complete"
        ></button>

        <div class="qmain">
          <div class="qmeta">
            <span class="qchip ${category}">${categoryLabel}</span>
            <span class="qdue"><i class="fa-regular fa-clock"></i>24h</span>
          </div>

          <h3 class="qname">${this.escapeHtml(challenge.name || challenge.shortName || "Unnamed Challenge")}</h3>
          <p class="qdesc">
            ${this.escapeHtml(challenge.summary || challenge.description || "Complete this challenge")}
          </p>

          <div class="qrewards">
            <span class="reward exp"
              ><i class="fa-solid fa-bolt"></i>+${xpReward} EXP</span
            >
            <span class="reward stat"
              ><i class="fa-solid fa-star"></i>${statReward}</span
            >
          </div>
        </div>

        <button class="qbtn" type="button">Complete</button>
      </article>
    `;
  }

  getCategoryIcon(category) {
    const icons = {
      physical: "fa-dumbbell",
      intellectual: "fa-brain",
      discipline: "fa-shield-halved",
      confidence: "fa-fire",
      mental: "fa-moon",
    };
    return icons[category] || "fa-star";
  }

  getCategoryLabel(category) {
    const labels = {
      physical: "PHYSICAL",
      intellectual: "INTELLECTUAL",
      discipline: "DISCIPLINE",
      confidence: "CONFIDENCE",
      mental: "MENTAL",
    };
    return labels[category] || category.toUpperCase();
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
