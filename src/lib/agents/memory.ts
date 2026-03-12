import { Firestore } from "@google-cloud/firestore";
import { VertexAI } from "@google-cloud/vertexai";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";

// Initialize GCP services only if configured, otherwise fallback to local DB or mock
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = process.env.GCP_LOCATION || "us-central1";

let firestore: Firestore | null = null;
let vertexAi: VertexAI | null = null;

if (PROJECT_ID) {
  try {
    firestore = new Firestore({ projectId: PROJECT_ID });
    vertexAi = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  } catch (e) {
    logger.warn("Failed to initialize GCP infrastructure for Agent Memory", e);
  }
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "agent",
  content: string,
) {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  if (firestore) {
    await firestore
      .collection("agent_sessions")
      .doc(sessionId)
      .collection("messages")
      .doc(id)
      .set({
        role,
        content,
        timestamp,
      });
  } else {
    // Fallback to postgres (table managed by db.ts schema init)
    const db = getDb();
    await db.query(
      "INSERT INTO agent_messages (id, session_id, role, content) VALUES ($1, $2, $3, $4)",
      [id, sessionId, role, content],
    );

    // Set session title from the first user message
    if (role === "user") {
      await db.query(
        `UPDATE agent_sessions SET title = $1 WHERE id = $2 AND title IS NULL`,
        [content.slice(0, 120), sessionId],
      );
    }
  }
}

export async function getSessionHistory(
  sessionId: string,
  limit = 20,
): Promise<StoredMessage[]> {
  if (firestore) {
    const snapshot = await firestore
      .collection("agent_sessions")
      .doc(sessionId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limitToLast(limit)
      .get();

    if (snapshot.empty) return [];
    return snapshot.docs.map((d) => ({
      id: d.id,
      sessionId,
      role: d.data().role,
      content: d.data().content,
      timestamp: d.data().timestamp,
    }));
  } else {
    // Fallback to postgres
    const db = getDb();
    try {
      const res = await db.query(
        "SELECT id, role, content, created_at FROM agent_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2",
        [sessionId, limit],
      );
      return res.rows.map((r) => ({
        id: r.id as string,
        sessionId,
        role: r.role as "user" | "agent",
        content: r.content as string,
        timestamp: String(r.created_at),
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Semantic memory using Vertex AI models.
 */
export async function extractAndStoreMemory(
  workspaceId: string,
  content: string,
) {
  if (!vertexAi) return;
  // This is a placeholder for semantic memory logic:
  // 1. Generate embeddings using Vertex AI
  // 2. Persist to a Vertex AI Vector Search Index or Postgres pgvector
  try {
    const generativeModel = vertexAi.preview.getGenerativeModel({
      model: "gemini-1.5-pro-preview-0409",
    });
    const extractionResponse = await generativeModel.generateContent(
      `Extract long-term memory facts from this text if any:\\n${content}`,
    );
    const facts =
      extractionResponse.response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (facts && facts.trim().length > 0) {
      if (firestore) {
        await firestore
          .collection("workspaces")
          .doc(workspaceId)
          .collection("memories")
          .add({
            facts,
            timestamp: new Date().toISOString(),
          });
      }
    }
  } catch (error) {
    logger.error("Vertex AI semantic memory extraction failed", error);
  }
}

export async function getSemanticContext(workspaceId: string): Promise<string> {
  if (firestore) {
    const snapshot = await firestore
      .collection("workspaces")
      .doc(workspaceId)
      .collection("memories")
      .orderBy("timestamp", "desc")
      .limit(5)
      .get();
    if (snapshot.empty) return "No long-term memories found.";
    return snapshot.docs.map((d) => d.data().facts).join("\\n");
  }
  return "";
}
