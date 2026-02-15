class HabiticaAPI {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.demoData = this.generateDemoData();
  }

  generateDemoData() {
    return {
      "system-1": {
        name: "No screen time after waking up - 30 to 60 min",
        summary: "Discipline/Mental - DPL",
        slot: "morning",
        xp: 100,
        dpl: true,
        dplImpact: 1,
      },
      "system-2": {
        name: "No social media - full morning block",
        summary: "Discipline/Mental - DPL",
        slot: "morning",
        xp: 100,
        dpl: true,
        dplImpact: 1,
      },
      "system-3": {
        name: "No pornography/gaming - full morning block",
        summary: "Discipline/Mental - DPL",
        slot: "morning",
        xp: 85,
        dpl: true,
        dplImpact: 2,
      },
      "system-4": {
        name: "Drink water right after waking up - 1 full cup",
        summary: "Physical - Low XP",
        slot: "morning",
        xp: 40,
      },
      "system-5": {
        name: "Sunlight exposure - 5 to 10 minutes",
        summary: "Physical - Low XP - DPL",
        slot: "morning",
        xp: 40,
        dpl: true,
        dplImpact: 1,
      },
      "system-6": {
        name: "Deep breathing/Meditation - 3 to 5 minutes",
        summary: "Mental/Physical - Low XP - DPL",
        slot: "morning",
        xp: 40,
        dpl: true,
        dplImpact: 1,
      },
      "system-7": {
        name: "Plan the day - 5 minutes",
        summary: "Discipline - Low XP",
        slot: "morning",
        xp: 40,
      },
      "system-8": {
        name: "Speak up in class, in a meeting",
        summary: "Confidence - Mid XP",
        slot: "morning",
        xp: 70,
      },

      "system-9": {
        name: "Study/deep work sessions - school hours",
        summary: "Intellectual - Low XP",
        slot: "noon",
        xp: 40,
      },
      "system-25": {
        name: "Light meal (Low carb/high protein)",
        summary: "Physical/Discipline - DPL",
        slot: "noon",
        xp: 70,
        dpl: true,
        dplImpact: 1,
      },
      "system-10": {
        name: "Eat without phone - entire meal",
        summary: "Discipline - DPL",
        slot: "noon",
        xp: 70,
        dpl: true,
        dplImpact: 1,
      },
      "system-11": {
        name: "No social media scrolling - noon block",
        summary: "Mental - DPL",
        slot: "noon",
        xp: 100,
        dpl: true,
        dplImpact: 1,
      },
      "system-12": {
        name: "Walk after eating - 5 to 15 minutes",
        summary: "Physical - Mid XP",
        slot: "noon",
        xp: 70,
      },
      "system-13": {
        name: "Speak up in class, in a meeting",
        summary: "Confidence - Mid XP",
        slot: "noon",
        xp: 70,
      },
      "system-14": {
        name: "Lead a discussion at school, work",
        summary: "Confidence - High XP",
        slot: "noon",
        xp: 100,
      },

      "system-15": {
        name: "Physical Exercise - 30 minutes to 1 hour",
        summary: "Physical - High XP",
        slot: "afternoon",
        xp: 100,
      },
      "system-16": {
        name: "Skill Practice or homework - 30 to 60 minutes",
        summary: "Intellectual - Low XP",
        slot: "afternoon",
        xp: 40,
      },
      "system-17": {
        name: "No gaming/pornography - afternoon block",
        summary: "Mental - DPL",
        slot: "afternoon",
        xp: 100,
        dpl: true,
        dplImpact: 2,
      },
      "system-18": {
        name: "Limit social media - under 30 minutes",
        summary: "Mental - DPL",
        slot: "afternoon",
        xp: 100,
        dpl: true,
        dplImpact: 1,
      },
      "system-19": {
        name: "Sport Activity - 30 minutes",
        summary: "Physical - High XP",
        slot: "afternoon",
        xp: 100,
      },
      "system-20": {
        name: "Lead a discussion at school, work",
        summary: "Confidence - Mid XP",
        slot: "afternoon",
        xp: 70,
      },

      "system-21": {
        name: "Share a story during dinner",
        summary: "Confidence - Low XP",
        slot: "evening",
        xp: 40,
      },
      "system-22": {
        name: "Controlled entertainment - under 60 minutes",
        summary: "Discipline - DPL",
        slot: "evening",
        xp: 70,
        dpl: true,
        dplImpact: 1,
      },
      "system-23": {
        name: "Reading book/article - 10 to 20 minutes",
        summary: "Intellectual - High XP",
        slot: "evening",
        xp: 100,
      },
      "system-24": {
        name: "Sleep at least 7 hours",
        summary: "Mental - High XP",
        slot: "evening",
        xp: 100,
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
        slot: this.demoData[challengeId].slot,
        xp: this.demoData[challengeId].xp,
        dpl: !!this.demoData[challengeId].dpl,
        dplImpact: Number(this.demoData[challengeId].dplImpact) || 0,
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
    const xpReward = Number.isFinite(Number(challenge.xp))
      ? Number(challenge.xp)
      : this.config.defaultXpPerCategory[category] ||
        this.config.defaultXpPerCategory.mental;
    const statReward =
      this.config.defaultStatPerCategory[category] ||
      this.config.defaultStatPerCategory.mental;

    const categoryLabel = this.getCategoryLabel(category);

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
