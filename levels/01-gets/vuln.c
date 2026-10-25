#include <stdio.h>

void vulnerable_read(void) {
    char buffer[16];
    printf("Enter your name: ");
    gets(buffer); /* VULNERABLE: no bounds checking, no length argument */
    printf("Hello, %s!\n", buffer);
}

int main(void) {
    vulnerable_read();
    printf("Returned safely.\n");
    return 0;
}
