// All new teaching uses the flexible contract. Historical JSON is read without invoking retired generators.
export type SourceFragment={id:string;title:string;url:string;location:string;text:string;contentHash:string};
export {NodeTeachingError,teachingObject,teachingText} from "./nodeTeaching";
export * from "./flexibleTeaching";
export type {LearningView as TeachingView} from "./flexibleTeaching";
