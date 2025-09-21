// Sample JavaScript file for testing
function calculateSum(a, b) {
    return a + b;
}

const numbers = [1, 2, 3, 4, 5];
let total = 0;

for(let i = 0; i < numbers.length; i++) {
    total += numbers[i];
}

console.log("Total:", total);
console.log("Sum of 10 and 20:", calculateSum(10, 20));