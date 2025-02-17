import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types/env.ts";
import type { Variables } from "./types/hono.ts";
import { authApiKey } from "../../../libs/middleware/src/auth-api-key";
export { TechnicalWriter } from "./workflows/TechnicalWriter";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import z from "zod";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(cors());
app.use("*", authApiKey);

const outlineSchema = z.object({
	outline: z.array(z.string()),
});

const criteriaSchema = z.object({
	meetsCriteria: z.boolean(),
});

const documentationSchema = z.object({
	documentation: z.string(),
});

app.post("/", async (c) => {
	// Extract the initial prompt from the request.
	const { prompt } = (await c.req.json()) as { prompt: string };

	const openai = createOpenAI({
		apiKey: c.env.OPENAI_API_KEY,
	});

	// --- Step 1: Generate the Outline ---
	const outlinePrompt = `${prompt}\n\nPlease generate a detailed outline for the technical documentation.`;
	const { object: outlineObj } = await generateObject({
		model: openai("gpt-4o-mini"),
		schema: outlineSchema,
		prompt: outlinePrompt,
	});

	// --- Step 2: Evaluate the Outline ---
	const criteriaPrompt = `Please evaluate the following technical documentation outline against our criteria:\n\n${JSON.stringify(outlineObj)}\n\nReturn a JSON object with a boolean field "meetsCriteria" that is true if the outline meets the criteria, or false otherwise.`;
	const { object: criteriaObj } = await generateObject({
		model: openai("gpt-4o-mini"),
		schema: criteriaSchema,
		prompt: criteriaPrompt,
	});

	// If the outline does not meet the criteria, terminate the process.
	if (!criteriaObj.meetsCriteria) {
		return c.json({ error: "Outline does not meet the criteria." }, 400);
	}

	// --- Step 3: Generate Full Technical Documentation ---
	const documentationPrompt = `Using the following approved outline for technical documentation:\n\n${JSON.stringify(outlineObj)}\n\nPlease generate the full technical documentation in a detailed and organised manner.`;
	const { object: documentationObj } = await generateObject({
		model: openai("gpt-4o-mini"),
		schema: documentationSchema,
		prompt: documentationPrompt,
	});

	return c.json({
		outline: outlineObj,
		criteria: criteriaObj,
		documentation: documentationObj,
	});
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
