# Research-backed domain map generation

Status: Partially superseded by ADR 0009

We will not treat one-shot model output from a short user prompt as a reliable, research-backed domain map. A research-backed path uses a network-capable model to research external course structures, preserve source traceability, synthesize a course skeleton, and show learner-facing reorder rationales whenever AI changes the sequence.

Internet access is not a hard prerequisite for every Domain Map because LM Studio and other local OpenAI-compatible APIs remain valid AI planning providers. ADR 0009 supersedes this ADR's former manual and direct curated-source creation paths: curated material may be supplied to AI as planning input or evidence, but cannot independently create a formal map. Regardless of AI provider, the result must preserve provenance and verification status and pass the same structural and user-confirmation gates. A local result without verifiable external sources must not be labelled a Research-Backed Course Skeleton.
