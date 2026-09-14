#include <cmath>
#include <iostream>
#include <string>

int main() {
    std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
    const bool has_coordinates = input.find("latitude") != std::string::npos && input.find("longitude") != std::string::npos;
    const bool has_construction = input.find("constructionCode") != std::string::npos;
    const double score = has_coordinates && has_construction ? 1.0 : 0.0;
    std::cout << "{\"engine\":\"cpp-compliance\",\"score\":" << score
              << ",\"status\":\"" << (score == 1.0 ? "COMPLIANT" : "REJECTED") << "\"}";
    return 0;
}
