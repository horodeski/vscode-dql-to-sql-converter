<script setup lang="ts">
import { ref } from 'vue';

import { changeOrmToSql } from '../utils/OrmToSql';
import { ChangeSqlToOrm } from '../utils/SqlToOrm';

import TextArea from './components/TextArea.vue';
import Button from './components/Button.vue';

const conversionType = ref<'ormToSql' | 'sqlToOrm'>('ormToSql');

const inputText = ref('');
const outputText = ref('');

const labels = {
  ormToSql: { input: 'Query ORM', output: 'SQL Resultado' },
  sqlToOrm: { input: 'Query SQL', output: 'ORM Resultado' },
};

function convert() {
  if (conversionType.value === 'ormToSql') {
    outputText.value = changeOrmToSql(inputText.value);
  } else {
    outputText.value = ChangeSqlToOrm(inputText.value);
  }
}
</script>


<template>
  <div class="panel-wrapper">
    <div class="header">
      <span class="title">Converta a query com segurança e direto da IDE</span>
    </div>
    <div class="main">
      <select v-model="conversionType">
        <option value="ormToSql">ORM para SQL</option>
        <option value="sqlToOrm">SQL para ORM</option>
      </select>
      <div class="content">
        <TextArea v-model="inputText" :label="labels[conversionType].input" />
        <Button text="Converter" @click="convert" />
        <TextArea v-model="outputText" :label="labels[conversionType].output" />
      </div>
    </div>
    <div class="footer">
      <a href="">horodeski repo</a>
    </div>
  </div>
</template>
