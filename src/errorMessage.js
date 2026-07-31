/** 统一失败文案：环节 / 问题 / 详情 / 建议 */
export function failureMessage({ stage, problem, detail, tip }) {
  return [
    stage ? `【环节】${stage}` : null,
    problem ? `【问题】${problem}` : null,
    detail ? `【详情】${detail}` : null,
    tip ? `【建议】${tip}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
