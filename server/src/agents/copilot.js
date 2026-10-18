import llmClient from '../integrations/llm.js';
import reasoningAgent from './reasoning.js';
import patrolPlanner from './patrol.js';
import logger from '../logger.js';

export class CopilotAssistant {
  /**
   * Execute read-only deterministic tools over live in-memory and database cases.
   */
  getReadonlyTools(cases) {
    return {
      getSectorDistribution: () => {
        const counts = {};
        cases.forEach((c) => {
          const sec = c.sector || 'Open Ocean';
          if (!counts[sec]) counts[sec] = { total: 0, high: 0, medium: 0, low: 0, cases: [] };
          counts[sec].total += 1;
          if (c.band === 'High') counts[sec].high += 1;
          else if (c.band === 'Medium') counts[sec].medium += 1;
          else counts[sec].low += 1;
          counts[sec].cases.push({ id: c.id, score: c.score_final, lat: c.lat, lon: c.lon });
        });
        return counts;
      },

      getMpaIncursions: () => {
        return cases
          .filter((c) => c.features?.inMPA || (c.features?.distanceToMpaKm !== undefined && c.features.distanceToMpaKm < 5))
          .map((c) => ({
            id: c.id,
            mpaName: c.features?.mpaName || 'Marine Protected Area',
            sector: c.sector,
            score: c.score_final,
            band: c.band,
            lat: c.features?.lat ?? c.lat,
            lon: c.features?.lon ?? c.lon,
            rationale: c.rationale,
          }));
      },

      getTopThreatCases: (limit = 5) => {
        return [...cases]
          .sort((a, b) => (b.score_final || 0) - (a.score_final || 0))
          .slice(0, limit)
          .map((c) => ({
            id: c.id,
            score: c.score_final,
            band: c.band,
            sector: c.sector,
            candidate: c.candidate_matches?.[0]?.vesselName || c.features?.candidate_matches?.[0]?.vesselName || 'Unidentified',
            lat: c.features?.lat ?? c.lat,
            lon: c.features?.lon ?? c.lon,
            rationale: c.rationale,
          }));
      },

      getIdentityMatches: () => {
        return cases
          .filter((c) => (c.candidate_matches && c.candidate_matches.length > 0) || (c.features?.candidate_matches && c.features.candidate_matches.length > 0))
          .map((c) => {
            const match = (c.candidate_matches && c.candidate_matches[0]) || c.features.candidate_matches[0];
            return {
              caseId: c.id,
              candidateName: match.vesselName,
              flag: match.flag,
              mmsi: match.mmsi,
              confidence: match.confidencePct,
              iotcAuthorized: match.iotcAuthorized,
              iuuListed: match.iuuListed,
              sector: c.sector,
            };
          });
      },

      getPatrolPlan: (baseId = 'mombasa') => {
        return patrolPlanner.planPatrol(cases, { baseId });
      },
    };
  }

  /**
   * Handle natural language query using safe read-only tools and LLM reasoning.
   */
  async answerQuery(userQuery, activeCases = []) {
    const cases = activeCases.length > 0 ? activeCases : reasoningAgent.getInMemoryCases();
    const tools = this.getReadonlyTools(cases);

    // Run all safe data aggregations
    const sectorStats = tools.getSectorDistribution();
    const mpaCases = tools.getMpaIncursions();
    const topThreats = tools.getTopThreatCases(5);
    const identityMatches = tools.getIdentityMatches();

    const dataContext = JSON.stringify({
      totalDetectionsEvaluated: cases.length,
      sectorBreakdown: sectorStats,
      mpaIncursions: mpaCases,
      topThreats,
      suspectedVesselMatches: identityMatches,
    }, null, 2);

    const prompt = `
You are "Ask SentinelCatch", the AI maritime tactical copilot for Kenyan coastal fisheries enforcement officers.
Answer the user's question clearly, concisely, and factually based STRICTLY on the read-only operational telemetry provided below.

USER QUESTION: "${userQuery}"

VERIFIED OPERATIONAL TELEMETRY (SAFE READ-ONLY SNAPSHOT):
${dataContext}

INSTRUCTIONS:
1. Provide a direct, professional 2-3 paragraph answer citing real numbers, sectors, and coordinates.
2. If asking about sectors (e.g. "which sector had the most dark detections"), identify the exact sector with counts and mention the highest threat incident.
3. If asking about MPAs or identity, list the vessel candidates and their RFMO / IOTC status.
4. Extract the relevant case IDs mentioned so officers can click directly to them.

RESPOND ONLY IN VALID JSON matching this format:
{
  "answer": "string markdown with clear facts",
  "linkedCaseIds": [1, 2],
  "suggestedFollowUps": ["Question 1?", "Question 2?"]
}
`;

    try {
      const response = await llmClient.generate({ prompt, jsonMode: true });
      if (response && response.text) {
        const parsed = JSON.parse(response.text);
        return {
          ...parsed,
          source: `${response.provider} (${response.model})`,
        };
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Copilot LLM response error; using deterministic answer');
    }

    // Deterministic fallback response if LLM is offline
    return this.generateDeterministicAnswer(userQuery, cases, sectorStats, mpaCases, topThreats);
  }

  generateDeterministicAnswer(userQuery, cases, sectorStats, mpaCases, topThreats) {
    const q = (userQuery || '').toLowerCase();
    const linkedIds = [];

    let answer = '';
    if (q.includes('sector') || q.includes('most') || q.includes('where')) {
      let maxSector = 'Lamu';
      let maxCount = -1;
      for (const [sec, stat] of Object.entries(sectorStats)) {
        if (stat.total > maxCount) {
          maxCount = stat.total;
          maxSector = sec;
        }
      }
      const topInSector = topThreats.find((t) => t.sector === maxSector) || topThreats[0];
      if (topInSector) linkedIds.push(topInSector.id);

      answer = `**Sector Intelligence Summary**: The sector with the highest volume of dark radar contacts is **${maxSector}** with **${maxCount} active detections** (including ${sectorStats[maxSector]?.high || 0} High-severity cases).\n\nPrimary hot-spot coordinates are centered around **${topInSector ? `${topInSector.lat.toFixed(3)}°N, ${topInSector.lon.toFixed(3)}°E` : 'offshore waters'}**, intersecting primary longline grounds.`;
    } else if (q.includes('mpa') || q.includes('park') || q.includes('protected')) {
      mpaCases.forEach((c) => linkedIds.push(c.id));
      answer = `**Marine Protected Area (MPA) Incursions**: There are currently **${mpaCases.length} vessels** detected inside or within close proximity (<5 km) of Kenya's Marine Protected Areas.\n\n${
        mpaCases.map((m) => `• **Case #${m.id}** (${m.sector}): Operating inside **${m.mpaName}** (Score: ${m.score}/100 - ${m.band})`).join('\n')
      }`;
    } else {
      topThreats.slice(0, 3).forEach((t) => linkedIds.push(t.id));
      answer = `**Operations Overview**: SentinelCatch is actively monitoring **${cases.length} dark contacts** across Kenya's EEZ. The highest threat incident is **Case #${topThreats[0]?.id || 1}** in the **${topThreats[0]?.sector || 'Lamu'}** sector scoring **${topThreats[0]?.score || 88}/100**.\n\nSuspected candidate matching indicates probable identity **${topThreats[0]?.candidate || 'unauthorized longliner'}** operating without Indian Ocean Tuna Commission (IOTC) authorization.`;
    }

    return {
      answer,
      linkedCaseIds: linkedIds,
      suggestedFollowUps: [
        'Which sector had the most dark detections this week?',
        'Are there any vessels operating inside Marine Protected Areas?',
        'What are the recommended patrol routes from Mombasa and Lamu?',
      ],
      source: 'Deterministic Tactical Query Engine',
    };
  }
}

export const copilotAssistant = new CopilotAssistant();
export default copilotAssistant;
