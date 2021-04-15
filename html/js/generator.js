//Random Number Generators for all Distributions

//Generate a random number in the range [min, max)
function uniform(min, max){
    return Math.random() * (max - min) + min;
}

// //Generate a random number from a Bernoulli distribution
function bernoulli(p){
    if (Math.random() < p) {
        return 1;
    }
    else {
        return 0;
    }
}

// //Generate a random number from a normal distribution with the given mean and standard deviation
function normal(mu, sigma){
    return mu + sigma * Math.sqrt(-2 * Math.log(Math.random())) * Math.sin(2 * Math.PI * Math.random());
}

// //Generate a random integer number in the range [1, n]
function dice(n){
    return Math.floor(Math.random() * n) + 1;
}