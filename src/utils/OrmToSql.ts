export function changeOrmToSql(text: string): string {
  const sqlParts: string[] = [];

  // SELECT
  const selectMatch = text.match(/->select\(['"`]([\s\S]*?)['"`]\)/);
  if (selectMatch) {
    sqlParts.push(`SELECT ${selectMatch[1]}`);
  }

  // FROM
  const fromMatch = text.match(/->from\(['"`](\w+)['"`]\s*,\s*['"`](\w+)['"`]\)/);
  if (fromMatch) {
    sqlParts.push(`FROM ${fromMatch[1]} ${fromMatch[2]}`);
  }

  // JOINs
  const joinRegex = /->(innerJoin|leftJoin|rightJoin)\(\s*['"`](\w+)\.(\w+)['"`]\s*,\s*['"`](\w+)['"`]\s*\)/gi;
  let joinMatch;
  while ((joinMatch = joinRegex.exec(text)) !== null) {
    const joinType = joinMatch[1].toUpperCase().replace('INNERJOIN', 'INNER JOIN').replace('LEFTJOIN', 'LEFT JOIN').replace('RIGHTJOIN', 'RIGHT JOIN');
    const parentAlias = joinMatch[2];
    const relation = joinMatch[3];
    const alias = joinMatch[4];
    sqlParts.push(`${joinType} ${relation} ${alias} ON ${alias}.${parentAlias}_id = ${parentAlias}.id`);
  }

  // WHERE
  const whereMatch = text.match(/->where\(\s*['"`]([\s\S]*?)['"`]\s*\)/);
  if (whereMatch) {
    sqlParts.push(`WHERE ${whereMatch[1]}`);
  }

  // AND WHERE
  const andWhereRegex = /->andWhere\(\s*['"`]([\s\S]*?)['"`]\s*\)/gi;
  let andWhereMatch;
  while ((andWhereMatch = andWhereRegex.exec(text)) !== null) {
    sqlParts.push(`AND ${andWhereMatch[1]}`);
  }

  // OR WHERE
  const orWhereRegex = /->orWhere\(\s*['"`]([\s\S]*?)['"`]\s*\)/gi;
  let orWhereMatch;
  while ((orWhereMatch = orWhereRegex.exec(text)) !== null) {
    sqlParts.push(`OR ${orWhereMatch[1]}`);
  }

  // GROUP BY
  const groupByMatch = text.match(/->groupBy\(\s*['"`]([\s\S]*?)['"`]\s*\)/);
  if (groupByMatch) {
    sqlParts.push(`GROUP BY ${groupByMatch[1]}`);
  }

  // HAVING
  const havingMatch = text.match(/->having\(\s*['"`]([\s\S]*?)['"`]\s*\)/);
  if (havingMatch) {
    sqlParts.push(`HAVING ${havingMatch[1]}`);
  }

  // ORDER BY
  const orderByRegex = /->orderBy\(\s*['"`]([\s\S]*?)['"`]\s*,\s*['"`]([\s\S]*?)['"`]\s*\)/gi;
  let orderByMatch;
  while ((orderByMatch = orderByRegex.exec(text)) !== null) {
    sqlParts.push(`ORDER BY ${orderByMatch[1]} ${orderByMatch[2]}`);
  }

  // LIMIT
  const limitMatch = text.match(/->setMaxResults\(\s*(\d+)\s*\)/);
  if (limitMatch) {
    sqlParts.push(`LIMIT ${limitMatch[1]}`);
  }

  // OFFSET
  const offsetMatch = text.match(/->setFirstResult\(\s*(\d+)\s*\)/);
  if (offsetMatch) {
    sqlParts.push(`OFFSET ${offsetMatch[1]}`);
  }

  // Params
  const paramRegex = /->setParameter\(\s*['"`](\w+)['"`]\s*,\s*([\s\S]*?)\)/gi;
  const paramMap: Record<string, string> = {};
  let paramMatch;
  while ((paramMatch = paramRegex.exec(text)) !== null) {
    let value = paramMatch[2].trim();
    if (value === 'true') value = '1';
    else if (value === 'false') value = '0';
    else if (!isNaN(Number(value))) value = value;
    else value = value.replace(/['"`]/g, '');
    paramMap[paramMatch[1]] = value;
  }

  // Substituir params nas linhas SQL
  const finalSql = sqlParts
    .map((line) => line.replace(/:(\w+)/g, (_match, param) => (paramMap[param] !== undefined ? paramMap[param] : `:${param}`)))
    .join('\n');

  return finalSql + ';';
}
