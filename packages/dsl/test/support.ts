import Task from "no-show";
import { Option, dict, isIndexable } from "ts-std";

import {
  ObjectModel,
  ValidationDescriptor,
  ValidatorFactory,
  Validity,
  valid,
  validate
} from "@cross-check/core";
import build, {
  ValidationBuildable,
  ValidationBuilder,
  validates
} from "@cross-check/dsl";

export const presence = builder("presence");
export const str = builder("str");
export const email = builder<unknown>("email");
export const isEmail = builder<string>("isEmail");
export const uniqueness = builder("uniqueness");

let factories = dict<ValidatorFactory<unknown, unknown>>();

export function factory(name: string): ValidatorFactory<unknown, unknown> {
  if (!factories[name]) {
    factories[name] = () => {
      return () => new Task(async () => valid(undefined));
    };
  }
  return factories[name]!;
}

function builder<T = unknown, U extends T = T>(
  name: string
): () => ValidationBuilder<T, U>;
function builder<T, U extends T, Options>(
  name: string
): (options: Options) => ValidationBuilder<T, U>;
function builder(
  name: string
): (options: any) => ValidationBuilder<unknown, unknown> {
  return (options: any) => validates(name, factory(name), options);
}

export class Obj implements ObjectModel {
  get(object: unknown, key: string): unknown {
    return isIndexable(object) ? object[key] : undefined;
  }

  asList(object: unknown): Option<Array<unknown>> {
    if (Array.isArray(object)) {
      return object;
    } else {
      return null;
    }
  }
}

export function defaultRun<T, U extends T>(
  b: ValidationBuildable<T, U>,
  value: T
): Task<Validity<T, U>> {
  return run(build(b), value, new Obj());
}

export function buildAndRun<T, U extends T>(
  b: ValidationBuildable<T, U>,
  value: T,
  env: ObjectModel = new Obj()
): Task<Validity<T, U>> {
  return run(build(b), value, env);
}

export function run<T, U extends T, Options>(
  descriptor: ValidationDescriptor<T, Options, U>,
  value: T,
  env: ObjectModel = new Obj()
): Task<Validity<T, U>> {
  return validate(value, descriptor, null, env);
}
